import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma, RepairStatus, RepairEventType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { VisionService } from '../vision/vision.service';
import { AppliancesService } from '../appliances/appliances.service';
import { StateMachineEngine } from './state-machine.engine';
import { QUEUE_NAMES } from '../../queues/queues.constants';
import type {
  RepairSessionDto,
  RepairStateMachine,
  RepairTransitionResponse,
} from '@fixit/shared';

@Injectable()
export class RepairService {
  private readonly logger = new Logger(RepairService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly vision: VisionService,
    private readonly appliances: AppliancesService,
    @InjectQueue(QUEUE_NAMES.GENERATE_MAINTENANCE_PLAN)
    private readonly maintenanceQueue: Queue,
  ) {}

  async start(
    userId: string,
    args: { applianceId: string; symptom: string },
  ): Promise<RepairSessionDto> {
    const appliance = await this.prisma.appliance.findFirst({
      where: { id: args.applianceId, ownerId: userId },
      select: { id: true, type: true },
    });
    if (!appliance) throw new NotFoundException('Appliance not found.');

    const plan = await this.ai.generateRepairPlan({
      applianceType: appliance.type,
      symptom: args.symptom,
    });

    const persistedPlan = await this.prisma.repairPlan.create({
      data: {
        ownerId: userId,
        applianceId: appliance.id,
        symptom: args.symptom,
        diagnosis: plan.diagnosis,
        safetyWarnings: plan.safety_warnings,
        stateMachine: plan.state_machine as unknown as Prisma.InputJsonValue,
        modelName: plan.modelName,
      },
    });

    const session = await this.prisma.repairSession.create({
      data: {
        ownerId: userId,
        applianceId: appliance.id,
        planId: persistedPlan.id,
        currentStateId: plan.state_machine.start_state,
        events: {
          create: {
            type: RepairEventType.STATE_ENTERED,
            toStateId: plan.state_machine.start_state,
            payload: { reason: 'session start' } as Prisma.InputJsonValue,
          },
        },
      },
    });

    // Schedule a follow-up maintenance plan refresh after the session starts.
    await this.maintenanceQueue.add(
      'generate-after-repair',
      { userId, applianceId: appliance.id },
      { delay: 5_000, attempts: 3, removeOnComplete: 100, removeOnFail: 50 },
    );

    return this.toDto(session.id);
  }

  async respond(
    userId: string,
    sessionId: string,
    answer: string,
  ): Promise<RepairTransitionResponse> {
    const { session, plan, sm } = await this.loadSessionForUpdate(userId, sessionId);

    if (session.status !== RepairStatus.ACTIVE) {
      throw new BadRequestException('Repair session is not active.');
    }

    const result = StateMachineEngine.advanceWithAnswer(
      sm,
      session.currentStateId,
      answer,
    );

    await this.prisma.repairEvent.create({
      data: {
        sessionId,
        type: RepairEventType.USER_RESPONSE,
        fromStateId: session.currentStateId,
        toStateId: result.advanced ? result.nextStateId : session.currentStateId,
        payload: { answer } as Prisma.InputJsonValue,
      },
    });

    if (result.advanced) {
      await this.applyTransition(sessionId, result.nextStateId, result.terminal);
    } else {
      await this.touchActivity(sessionId);
    }

    void plan;
    const dto = await this.toDto(sessionId);
    return { session: dto, advanced: result.advanced };
  }

  async submitPhoto(
    userId: string,
    sessionId: string,
    imageUrl: string,
  ): Promise<RepairTransitionResponse> {
    const { session, sm } = await this.loadSessionForUpdate(userId, sessionId);

    if (session.status !== RepairStatus.ACTIVE) {
      throw new BadRequestException('Repair session is not active.');
    }

    const state = StateMachineEngine.getState(sm, session.currentStateId);
    if (state.type !== 'verify_photo') {
      throw new BadRequestException(
        'Current state does not require a photo verification.',
      );
    }

    await this.prisma.repairEvent.create({
      data: {
        sessionId,
        type: RepairEventType.PHOTO_SUBMITTED,
        fromStateId: session.currentStateId,
        payload: { imageUrl } as Prisma.InputJsonValue,
      },
    });

    const verdict = await this.vision.verifyPhoto({
      imageUrl,
      expectedVisual: state.expected_visual,
    });

    const result = StateMachineEngine.advanceWithPhoto(
      sm,
      session.currentStateId,
      verdict.passed,
    );

    await this.prisma.repairEvent.create({
      data: {
        sessionId,
        type: verdict.passed
          ? RepairEventType.PHOTO_VERIFIED
          : RepairEventType.PHOTO_REJECTED,
        fromStateId: session.currentStateId,
        toStateId: result.nextStateId,
        payload: {
          imageUrl,
          found: verdict.found,
          missing: verdict.missing,
          feedback: verdict.feedback,
        } as Prisma.InputJsonValue,
      },
    });

    await this.applyTransition(sessionId, result.nextStateId, result.terminal);

    const dto = await this.toDto(sessionId);
    return {
      session: dto,
      advanced: result.advanced,
      photoPassed: verdict.passed,
      feedback: verdict.feedback,
    };
  }

  async toDto(sessionId: string): Promise<RepairSessionDto> {
    const session = await this.prisma.repairSession.findUnique({
      where: { id: sessionId },
      include: { plan: true },
    });
    if (!session) throw new NotFoundException('Repair session not found.');

    const sm = session.plan.stateMachine as unknown as RepairStateMachine;
    const currentState = StateMachineEngine.getState(sm, session.currentStateId);

    return {
      id: session.id,
      applianceId: session.applianceId,
      status: session.status,
      diagnosis: session.plan.diagnosis,
      safetyWarnings: session.plan.safetyWarnings,
      currentStateId: session.currentStateId,
      currentState,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    };
  }

  // --- internals ---

  private async loadSessionForUpdate(userId: string, sessionId: string) {
    const session = await this.prisma.repairSession.findFirst({
      where: { id: sessionId, ownerId: userId },
      include: { plan: true },
    });
    if (!session) throw new NotFoundException('Repair session not found.');
    const sm = session.plan.stateMachine as unknown as RepairStateMachine;
    return { session, plan: session.plan, sm };
  }

  private async applyTransition(
    sessionId: string,
    nextStateId: string,
    terminal: boolean,
  ) {
    const newStatus = terminal ? RepairStatus.COMPLETED : RepairStatus.ACTIVE;
    const endedAt = terminal ? new Date() : null;

    await this.prisma.$transaction([
      this.prisma.repairSession.update({
        where: { id: sessionId },
        data: {
          currentStateId: nextStateId,
          status: newStatus,
          endedAt,
          lastActivityAt: new Date(),
        },
      }),
      this.prisma.repairEvent.create({
        data: {
          sessionId,
          type: terminal ? RepairEventType.COMPLETED : RepairEventType.STATE_ENTERED,
          toStateId: nextStateId,
        },
      }),
    ]);
  }

  private async touchActivity(sessionId: string) {
    await this.prisma.repairSession.update({
      where: { id: sessionId },
      data: { lastActivityAt: new Date() },
    });
  }

  // Used by AppliancesService surface; quick existence check.
  async assertSessionOwnership(userId: string, sessionId: string) {
    const ok = await this.prisma.repairSession.findFirst({
      where: { id: sessionId, ownerId: userId },
      select: { id: true },
    });
    if (!ok) throw new NotFoundException('Repair session not found.');
    void this.appliances; // suppress unused-import warning when API surface grows
  }
}

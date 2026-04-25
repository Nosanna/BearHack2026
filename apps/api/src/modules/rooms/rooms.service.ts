import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RoomDto } from '@fixit/shared';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<RoomDto[]> {
    const rooms = await this.prisma.room.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { appliances: true } } },
    });
    return rooms.map((r) => ({
      id: r.id,
      name: r.name,
      applianceCount: r._count.appliances,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async create(userId: string, name: string): Promise<RoomDto> {
    const room = await this.prisma.room.create({
      data: { ownerId: userId, name: name.trim() },
      include: { _count: { select: { appliances: true } } },
    });
    return {
      id: room.id,
      name: room.name,
      applianceCount: room._count.appliances,
      createdAt: room.createdAt.toISOString(),
    };
  }

  async getById(userId: string, roomId: string): Promise<RoomDto> {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, ownerId: userId },
      include: { _count: { select: { appliances: true } } },
    });
    if (!room) throw new NotFoundException('Room not found.');
    return {
      id: room.id,
      name: room.name,
      applianceCount: room._count.appliances,
      createdAt: room.createdAt.toISOString(),
    };
  }

  async remove(userId: string, roomId: string): Promise<void> {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, ownerId: userId },
      include: { _count: { select: { appliances: true } } },
    });
    if (!room) throw new NotFoundException('Room not found.');
    if (room._count.appliances > 0) {
      throw new ConflictException(
        'Remove all appliances from this room before deleting it.',
      );
    }
    await this.prisma.room.delete({ where: { id: roomId } });
  }

  async assertOwnership(userId: string, roomId: string): Promise<void> {
    const found = await this.prisma.room.findFirst({
      where: { id: roomId, ownerId: userId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Room not found.');
  }
}

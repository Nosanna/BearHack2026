import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { AppliancesModule } from './modules/appliances/appliances.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ScheduleApiModule } from './modules/schedule/schedule.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { DemoModule } from './modules/demo/demo.module';
import { RepairModule } from './modules/repair/repair.module';
import { VisionModule } from './modules/vision/vision.module';
import { AiModule } from './modules/ai/ai.module';
import { MediaModule } from './modules/media/media.module';
import { VoiceModule } from './modules/voice/voice.module';
import { QueuesModule } from './queues/queues.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    ThrottlerModule.forRootAsync({
      useFactory: () => [
        {
          ttl: Number(process.env.THROTTLE_TTL_SECONDS ?? 60) * 1000,
          limit: Number(process.env.THROTTLE_LIMIT ?? 120),
        },
      ],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    QueuesModule,
    AuthModule,
    RoomsModule,
    AppliancesModule,
    DashboardModule,
    ScheduleApiModule,
    TasksModule,
    DemoModule,
    RepairModule,
    VisionModule,
    AiModule,
    MediaModule,
    VoiceModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}

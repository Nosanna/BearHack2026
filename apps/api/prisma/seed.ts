import { PrismaClient, ApplianceType, TaskStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'demo@fixit.local' },
    create: { email: 'demo@fixit.local', name: 'Demo User' },
    update: {},
  });

  const kitchen = await prisma.room.upsert({
    where: { id: `${user.id}-kitchen` },
    update: { name: 'Kitchen' },
    create: { id: `${user.id}-kitchen`, name: 'Kitchen', ownerId: user.id },
  });

  const fridge = await prisma.appliance.upsert({
    where: { id: `${user.id}-fridge` },
    update: {},
    create: {
      id: `${user.id}-fridge`,
      ownerId: user.id,
      roomId: kitchen.id,
      type: ApplianceType.REFRIGERATOR,
      brand: 'Whirlpool',
      model: 'WRT318FZDW',
      nickname: 'Kitchen Fridge',
    },
  });

  await prisma.maintenanceTask.upsert({
    where: { id: `${fridge.id}-coil` },
    update: {},
    create: {
      id: `${fridge.id}-coil`,
      ownerId: user.id,
      applianceId: fridge.id,
      title: 'Vacuum the condenser coils',
      description: 'Pull the fridge out and vacuum dust off the back coils.',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: TaskStatus.PENDING,
      cadenceDays: 180,
      estimatedMinutes: 20,
    },
  });

  console.log(`Seeded demo user (${user.email}), 1 room, 1 appliance, 1 task.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

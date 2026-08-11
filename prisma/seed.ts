import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const customer = await prisma.customer.upsert({
    where: { id: '5a6ce6b4-0d65-4d16-90dc-04b751f5169b' },
    update: {},
    create: {
      id: '5a6ce6b4-0d65-4d16-90dc-04b751f5169b',
      name: 'Demo Apparel Group',
      description: 'Fictional customer used for local development.',
      defaultAlertThreshold: 60,
    },
  });

  await prisma.user.upsert({
    where: { email: 'customer@demo.suppliesignal.local' },
    update: {},
    create: {
      // In a configured environment this must match the Supabase Auth user UUID.
      id: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f',
      email: 'customer@demo.suppliesignal.local',
      name: 'Demo Customer',
      role: UserRole.CUSTOMER,
    },
  });

  await prisma.customerMembership.upsert({
    where: {
      userId_customerId: {
        userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f',
        customerId: customer.id,
      },
    },
    update: {},
    create: {
      userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f',
      customerId: customer.id,
    },
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

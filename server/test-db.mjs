import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://provenhire_rr2a_user:tWXoDcniR0NK971tHjea2NihriWym6T0@dpg-d6ksmq15pdvs738p41kg-a.oregon-postgres.render.com/provenhire_rr2a?sslmode=require'
    }
  }
});
prisma.dataRoundTask.count()
  .then(count => {
    console.log("DataRoundTask count:", count);
  })
  .catch(err => {
    console.error("Error:", err.message);
  })
  .finally(() => prisma.$disconnect());

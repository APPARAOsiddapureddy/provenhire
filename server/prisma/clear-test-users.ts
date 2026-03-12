/**
 * Clear all job seeker, recruiter, and expert interviewer users (test data).
 * Keeps admin users. Run before going live.
 *
 * Run: cd server && npx tsx prisma/clear-test-users.ts
 */
import { PrismaClient } from "@prisma/client";

const ROLES_TO_CLEAR = ["jobseeker", "recruiter", "expert_interviewer"] as const;

async function main() {
  const prisma = new PrismaClient();

  const users = await prisma.user.findMany({
    where: { role: { in: [...ROLES_TO_CLEAR] } },
    select: { id: true, email: true, role: true },
  });

  if (users.length === 0) {
    console.log("No test users (jobseeker, recruiter, expert_interviewer) found. Database is already clean.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${users.length} user(s) to remove (roles: ${ROLES_TO_CLEAR.join(", ")}).`);
  users.slice(0, 5).forEach((u) => console.log(`  - ${u.email} (${u.role})`));
  if (users.length > 5) console.log(`  ... and ${users.length - 5} more`);

  const userIds = users.map((u) => u.id);

  await prisma.$transaction(async (tx) => {
    // 1. Interview messages (via Interview)
    const interviews = await tx.interview.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const interviewIds = interviews.map((i) => i.id);
    if (interviewIds.length > 0) {
      await tx.interviewMessage.deleteMany({ where: { interviewId: { in: interviewIds } } });
    }

    // 2. Interviews
    await tx.interview.deleteMany({ where: { userId: { in: userIds } } });

    // 3. Job applications by job seekers
    await tx.jobApplication.deleteMany({ where: { jobSeekerId: { in: userIds } } });

    // 4. Human interview sessions
    await tx.humanInterviewSession.deleteMany({ where: { userId: { in: userIds } } });

    // 5. Free up interviewer slots booked by these users
    await tx.interviewerSlot.updateMany({ where: { bookedUserId: { in: userIds } }, data: { bookedUserId: null } });

    // 6. Verification stages, aptitude, DSA, resume, notifications, appeals, saved jobs
    await tx.verificationStage.deleteMany({ where: { userId: { in: userIds } } });
    await tx.aptitudeTestResult.deleteMany({ where: { userId: { in: userIds } } });
    await tx.aptitudeSession.deleteMany({ where: { userId: { in: userIds } } });
    await tx.dsaRoundResult.deleteMany({ where: { userId: { in: userIds } } });
    await tx.resumeAnalysis.deleteMany({ where: { userId: { in: userIds } } });
    await tx.notification.deleteMany({ where: { userId: { in: userIds } } });
    await tx.appeal.deleteMany({ where: { userId: { in: userIds } } });
    await tx.savedJob.deleteMany({ where: { userId: { in: userIds } } });

    // 7. Candidate skill verifications (has CASCADE from User, but explicit for clarity)
    await tx.candidateSkillVerification.deleteMany({ where: { userId: { in: userIds } } });

    // 8. Job seeker profiles
    await tx.jobSeekerProfile.deleteMany({ where: { userId: { in: userIds } } });

    // 9. Recruiter profiles (Job.postedById will SET NULL automatically)
    await tx.recruiterProfile.deleteMany({ where: { userId: { in: userIds } } });

    // 10. Job alert subscriptions
    try {
      await tx.jobAlertSubscription.deleteMany({ where: { userId: { in: userIds } } });
    } catch {
      /* table or relation may not exist */
    }

    // 11. Refresh tokens, password reset tokens (CASCADE, but explicit for completeness)
    await tx.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await tx.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });

    // 12. Interviewer records - set userId to null (user is being deleted)
    await tx.interviewer.updateMany({ where: { userId: { in: userIds } }, data: { userId: null } });

    // 13. Delete users
    await tx.user.deleteMany({ where: { id: { in: userIds } } });

    // 14. Clear email verification codes (test/legacy data)
    const deleted = await tx.emailVerificationCode.deleteMany({});
    if (deleted.count > 0) {
      console.log(`Cleared ${deleted.count} email verification code(s).`);
    }
  });

  console.log(`\nSuccessfully removed ${users.length} user(s) and all related data.`);
  console.log("Admin users preserved.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

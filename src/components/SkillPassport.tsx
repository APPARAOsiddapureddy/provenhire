import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, CheckCircle2, Lock, Shield, Star, Trophy, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

/** Technical display: Profile Setup -> DSA Round -> AI Interview */
/** Non-technical: profile -> [domain] -> assignment -> expert (AI) */
export type CompletedUpToStage =
  | "profile"
  | "aptitude"
  | "dsa"
  | "ai_interview"
  | "expert"
  | "assignment"
  | "domain"
  | null;

interface SkillPassportProps {
  certificationLevel: "A" | "B" | "C" | null;
  skills: string[];
  verificationStatus: string | null;
  completedUpToStage?: CompletedUpToStage;
  aptitudeScore?: number;
  dsaScore?: number;
  interviewScore?: number;
  roleType?: "technical" | "non_technical";
  /** When true, non-tech path includes domain_fundamentals (early-career). */
  nonTechHasDomainFundamentals?: boolean;
  compact?: boolean;
}

const getTechnicalDisplayStageIndex = (stage: CompletedUpToStage) => {
  if (!stage) return -1;
  if (stage === "profile" || stage === "aptitude") return 0;
  if (stage === "dsa") return 1;
  if (stage === "ai_interview" || stage === "expert") return 2;
  return -1;
};

const SkillPassport = ({
  certificationLevel,
  skills,
  verificationStatus,
  completedUpToStage = null,
  dsaScore,
  interviewScore,
  roleType = "technical",
  nonTechHasDomainFundamentals = false,
  compact = false,
}: SkillPassportProps) => {
  const getLevelConfig = (level: "A" | "B" | "C" | null) => {
    switch (level) {
      case "A":
        return {
          label: "Level A",
          description: "Top Performer",
          color: "from-amber-400 to-yellow-500",
          bgColor: "bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30",
          borderColor: "border-amber-300 dark:border-amber-700",
          textColor: "text-amber-700 dark:text-amber-400",
          icon: Trophy,
          stars: 3,
        };
      case "B":
        return {
          label: "Level B",
          description: "Strong Performer",
          color: "from-slate-300 to-slate-400",
          bgColor: "bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900/30 dark:to-gray-900/30",
          borderColor: "border-slate-300 dark:border-slate-700",
          textColor: "text-slate-700 dark:text-slate-400",
          icon: Award,
          stars: 2,
        };
      case "C":
        return {
          label: "Level C",
          description: "Certified",
          color: "from-orange-400 to-amber-600",
          bgColor: "bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30",
          borderColor: "border-orange-300 dark:border-orange-700",
          textColor: "text-orange-700 dark:text-orange-400",
          icon: Shield,
          stars: 1,
        };
      default:
        return null;
    }
  };

  const levelConfig = getLevelConfig(certificationLevel);
  const isFullyVerified =
    verificationStatus === "verified" || verificationStatus === "expert_verified";

  const effectiveStage: CompletedUpToStage = isFullyVerified
    ? "expert"
    : completedUpToStage;

  const nonTechStageOrder: CompletedUpToStage[] = nonTechHasDomainFundamentals
    ? ["profile", "domain", "assignment", "expert"]
    : ["profile", "assignment", "expert"];
  const stageIndex = completedUpToStage
    ? nonTechStageOrder.indexOf(completedUpToStage)
    : -1;

  const technicalDisplayStageIndex =
    roleType === "technical" ? getTechnicalDisplayStageIndex(effectiveStage) : -1;
  const technicalStageStatus =
    technicalDisplayStageIndex === 0
      ? "Profile Setup complete - Next: DSA Round"
      : technicalDisplayStageIndex === 1
        ? "DSA Round complete - Next: AI Interview"
        : technicalDisplayStageIndex === 2
          ? "AI Interview complete"
          : "In progress";

  const showScoresFromDsa =
    roleType === "technical" && technicalDisplayStageIndex >= 1;
  const nonTechAssignmentIdx = nonTechStageOrder.indexOf("assignment");
  const showAssignmentComplete =
    roleType === "non_technical" &&
    nonTechAssignmentIdx >= 0 &&
    stageIndex >= nonTechAssignmentIdx &&
    (effectiveStage === "assignment" || effectiveStage === "expert");
  const showInterviewScore =
    (roleType === "technical" && technicalDisplayStageIndex >= 2) ||
    (roleType === "non_technical" && effectiveStage === "expert");

  const getNextStepMessage = (): string => {
    if (isFullyVerified) return "";
    if (roleType === "technical") {
      if (!effectiveStage || effectiveStage === "profile" || effectiveStage === "aptitude") {
        return "Complete DSA Round to unlock scores";
      }
      if (effectiveStage === "dsa") return "Complete AI Interview to unlock Skill Passport";
      return "";
    }
    if (!effectiveStage || effectiveStage === "profile") {
      return nonTechHasDomainFundamentals
        ? "Complete Domain Fundamentals to continue"
        : "Complete Assignment to unlock scores";
    }
    if (effectiveStage === "domain") return "Complete Assignment to unlock scores";
    if (effectiveStage === "assignment") return "Complete AI Expert Interview to unlock Skill Passport";
    return "";
  };

  const nextStepMessage = getNextStepMessage();

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {isFullyVerified && certificationLevel && levelConfig && (
          <Badge
            className={cn(
              "gap-1",
              levelConfig.bgColor,
              levelConfig.borderColor,
              levelConfig.textColor
            )}
          >
            <levelConfig.icon className="h-3 w-3" />
            ProvenHire {levelConfig.label}
          </Badge>
        )}
        {!isFullyVerified && (
          <Badge variant="secondary" className="gap-1">
            <Shield className="h-3 w-3" />
            {effectiveStage ? "Verification in progress" : "Verification Pending"}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-2 transition-all",
        isFullyVerified && levelConfig ? levelConfig.bgColor : "bg-muted/30",
        isFullyVerified && levelConfig ? levelConfig.borderColor : "border-border"
      )}
    >
      {isFullyVerified && levelConfig && (
        <div className="absolute top-0 right-0 w-32 h-32 opacity-10">
          <div
            className={cn(
              "w-full h-full rounded-full blur-3xl bg-gradient-to-br",
              levelConfig.color
            )}
          />
        </div>
      )}

      <CardHeader className="relative pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-14 h-14 rounded-xl flex items-center justify-center",
                isFullyVerified && levelConfig
                  ? `bg-gradient-to-br ${levelConfig.color} text-white shadow-lg`
                  : effectiveStage
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {isFullyVerified && levelConfig ? (
                <levelConfig.icon className="h-7 w-7" />
              ) : (
                <Shield className="h-7 w-7" />
              )}
            </div>
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                ProvenHire Skill Passport
                {isFullyVerified && (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
              </CardTitle>
              {isFullyVerified && levelConfig ? (
                <p className={cn("text-sm font-medium", levelConfig.textColor)}>
                  {levelConfig.label} - {levelConfig.description}
                </p>
              ) : effectiveStage ? (
                <p className="text-sm text-primary/90">
                  {roleType === "technical"
                    ? technicalStageStatus
                    : effectiveStage === "profile"
                      ? nonTechHasDomainFundamentals
                        ? "Profile complete - Next: Domain fundamentals"
                        : "Profile complete - Next: Assignment"
                      : effectiveStage === "domain"
                        ? "Domain fundamentals complete - Next: Assignment"
                        : effectiveStage === "assignment"
                          ? "Assignment complete - Next: AI Expert Interview"
                          : "In progress"}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Complete verification to unlock
                </p>
              )}
            </div>
          </div>
          {isFullyVerified && levelConfig && (
            <div className="flex gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "h-5 w-5",
                    i < levelConfig.stars
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted-foreground/30"
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="relative space-y-4">
        {!isFullyVerified && roleType === "technical" && (
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { key: "profile_setup", label: "Profile Setup" },
              { key: "dsa_round", label: "DSA Round" },
              { key: "ai_interview", label: "AI Interview" },
            ].map(({ key, label }, i) => {
              const done = technicalDisplayStageIndex >= i;
              return (
                <div
                  key={key}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                    done ? "bg-primary/20 text-primary" : "bg-muted/50 text-muted-foreground"
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Lock className="h-3 w-3" />
                  )}
                  {label}
                </div>
              );
            })}
          </div>
        )}
        {!isFullyVerified && roleType === "non_technical" && (
          <div className="flex items-center gap-2 flex-wrap">
            {(nonTechHasDomainFundamentals
              ? [
                  { key: "profile" as CompletedUpToStage, label: "Profile" },
                  { key: "domain" as CompletedUpToStage, label: "Fundamentals" },
                  { key: "assignment" as CompletedUpToStage, label: "Assignment" },
                  { key: "expert" as CompletedUpToStage, label: "AI Expert" },
                ]
              : [
                  { key: "profile" as CompletedUpToStage, label: "Profile" },
                  { key: "assignment" as CompletedUpToStage, label: "Assignment" },
                  { key: "expert" as CompletedUpToStage, label: "AI Expert" },
                ]
            ).map(({ key, label }) => {
              const idx = nonTechStageOrder.indexOf(key);
              const done = stageIndex >= idx && idx >= 0;
              return (
                <div
                  key={key}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                    done ? "bg-primary/20 text-primary" : "bg-muted/50 text-muted-foreground"
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Lock className="h-3 w-3" />
                  )}
                  {label}
                </div>
              );
            })}
          </div>
        )}

        <div
          className={cn(
            "grid gap-3",
            roleType === "non_technical" ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"
          )}
        >
          {roleType === "non_technical" ? (
            <>
              <div
                className={cn(
                  "text-center p-3 rounded-lg",
                  showAssignmentComplete ? "bg-background/60" : "bg-muted/30"
                )}
              >
                {showAssignmentComplete ? (
                  <>
                    <p className="text-2xl font-bold text-primary">Done</p>
                    <p className="text-xs text-muted-foreground">Assignment</p>
                  </>
                ) : (
                  <>
                    <Lock className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">Assignment</p>
                  </>
                )}
              </div>
              <div
                className={cn(
                  "text-center p-3 rounded-lg",
                  showInterviewScore ? "bg-background/60" : "bg-muted/30"
                )}
              >
                {showInterviewScore ? (
                  <>
                    <p className="text-2xl font-bold text-primary">
                      {interviewScore ?? 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">AI Expert Interview</p>
                  </>
                ) : (
                  <>
                    <Lock className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">AI Expert Interview</p>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div
                className={cn(
                  "text-center p-3 rounded-lg",
                  showScoresFromDsa ? "bg-background/60" : "bg-muted/30"
                )}
              >
                {showScoresFromDsa ? (
                  <>
                    <p className="text-2xl font-bold text-primary">
                      {dsaScore ?? 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">DSA Round</p>
                  </>
                ) : (
                  <>
                    <Lock className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">DSA Round</p>
                  </>
                )}
              </div>
              <div
                className={cn(
                  "text-center p-3 rounded-lg",
                  showInterviewScore ? "bg-background/60" : "bg-muted/30"
                )}
              >
                {showInterviewScore ? (
                  <>
                    <p className="text-2xl font-bold text-primary">
                      {interviewScore ?? 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">AI Interview</p>
                  </>
                ) : (
                  <>
                    <Lock className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">AI Interview</p>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {nextStepMessage && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-sm text-muted-foreground mb-2">{nextStepMessage}</p>
            <Button asChild size="sm" className="w-full sm:w-auto">
              <Link to="/verification">{"Continue Verification ->"}</Link>
            </Button>
          </div>
        )}

        {skills && skills.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Verified Skills
            </h4>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="gap-1 bg-background/80"
                >
                  {isFullyVerified && (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  )}
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {isFullyVerified && (
          <div className="pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Shield className="h-3 w-3" />
              {roleType === "technical"
                ? "3-Stage Verified - Only 18% of candidates pass"
                : "3-Stage Verified - Only 18% of candidates pass"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SkillPassport;

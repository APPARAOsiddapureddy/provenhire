import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, CheckCircle2, Lock, Shield, Star, Trophy, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

/** Technical: profile → aptitude → dsa → ai_interview → expert */
/** Non-technical: profile → assignment → expert */
export type CompletedUpToStage =
  | "profile"
  | "aptitude"
  | "dsa"
  | "ai_interview"
  | "expert"
  | "assignment"
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
  compact?: boolean;
}

const SkillPassport = ({
  certificationLevel,
  skills,
  verificationStatus,
  completedUpToStage = null,
  aptitudeScore,
  dsaScore,
  interviewScore,
  roleType = "technical",
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

  /** Technical stages in order; non-tech uses profile → assignment → expert */
  const techStageOrder: CompletedUpToStage[] = [
    "profile",
    "aptitude",
    "dsa",
    "ai_interview",
    "expert",
  ];
  const nonTechStageOrder: CompletedUpToStage[] = ["profile", "assignment", "expert"];

  const stageOrder =
    roleType === "non_technical" ? nonTechStageOrder : techStageOrder;
  const stageIndex = completedUpToStage
    ? stageOrder.indexOf(completedUpToStage)
    : -1;

  /** Determine effective stage for display (full verified overrides) */
  const effectiveStage: CompletedUpToStage = isFullyVerified
    ? "expert"
    : completedUpToStage;

  const showScoresFromDsa =
    roleType === "technical" &&
    (effectiveStage === "dsa" ||
      effectiveStage === "ai_interview" ||
      effectiveStage === "expert");
  const showScoresFromAptitude =
    (roleType === "technical" && stageIndex >= 1) ||
    (roleType === "non_technical" && (effectiveStage === "assignment" || effectiveStage === "expert"));
  const showInterviewScore =
    (roleType === "technical" && (effectiveStage === "ai_interview" || effectiveStage === "expert")) ||
    (roleType === "non_technical" && effectiveStage === "expert");

  const getNextStepMessage = (): string => {
    if (isFullyVerified) return "";
    if (roleType === "technical") {
      if (!effectiveStage || effectiveStage === "profile")
        return "Complete Aptitude Test to unlock scores";
      if (effectiveStage === "aptitude") return "Complete DSA Round to unlock more";
      if (effectiveStage === "dsa") return "Complete AI Interview to unlock Skill Passport";
      if (effectiveStage === "ai_interview")
        return "Complete Human Expert Interview for full certification";
    } else {
      if (!effectiveStage || effectiveStage === "profile")
        return "Complete Assignment to unlock scores";
      if (effectiveStage === "assignment")
        return "Complete Expert Interview to unlock Skill Passport";
    }
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
                    ? effectiveStage === "profile"
                      ? "Profile complete · Next: Aptitude"
                      : effectiveStage === "aptitude"
                        ? "Aptitude complete · Next: DSA"
                        : effectiveStage === "dsa"
                          ? "DSA complete · Next: AI Interview"
                          : effectiveStage === "ai_interview"
                            ? "AI Interview complete · Next: Human Expert"
                            : "In progress"
                    : effectiveStage === "profile"
                      ? "Profile complete · Next: Assignment"
                      : effectiveStage === "assignment"
                        ? "Assignment complete · Next: Expert Interview"
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
        {/* Stage progress indicator (when not fully verified) */}
        {!isFullyVerified && roleType === "technical" && (
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { key: "profile", label: "Profile" },
              { key: "aptitude", label: "Aptitude" },
              { key: "dsa", label: "DSA" },
              { key: "ai_interview", label: "AI Interview" },
              { key: "expert", label: "Expert" },
            ].map(({ key, label }, i) => {
              const idx = techStageOrder.indexOf(key as CompletedUpToStage);
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
        {!isFullyVerified && roleType === "non_technical" && (
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { key: "profile" as CompletedUpToStage, label: "Profile" },
              { key: "assignment" as CompletedUpToStage, label: "Assignment" },
              { key: "expert" as CompletedUpToStage, label: "Expert" },
            ].map(({ key, label }) => {
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

        {/* Scores - shown progressively based on completed stages */}
        <div
          className={cn(
            roleType === "non_technical" ? "grid grid-cols-2 gap-3" : "grid grid-cols-3 gap-3"
          )}
        >
          {roleType === "non_technical" ? (
            <>
              <div
                className={cn(
                  "text-center p-3 rounded-lg",
                  showScoresFromAptitude ? "bg-background/60" : "bg-muted/30"
                )}
              >
                {showScoresFromAptitude ? (
                  <>
                    <p className="text-2xl font-bold text-primary">✓</p>
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
                    <p className="text-xs text-muted-foreground">Expert Interview</p>
                  </>
                ) : (
                  <>
                    <Lock className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">Expert Interview</p>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div
                className={cn(
                  "text-center p-3 rounded-lg",
                  showScoresFromAptitude ? "bg-background/60" : "bg-muted/30"
                )}
              >
                {showScoresFromAptitude ? (
                  <>
                    <p className="text-2xl font-bold text-primary">
                      {aptitudeScore ?? 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">Aptitude</p>
                  </>
                ) : (
                  <>
                    <Lock className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">Aptitude</p>
                  </>
                )}
              </div>
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
                    <p className="text-xs text-muted-foreground">Technical</p>
                  </>
                ) : (
                  <>
                    <Lock className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">Technical</p>
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
                    <p className="text-xs text-muted-foreground">Interview</p>
                  </>
                ) : (
                  <>
                    <Lock className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">Interview</p>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Next step CTA */}
        {nextStepMessage && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-sm text-muted-foreground mb-2">{nextStepMessage}</p>
            <Button asChild size="sm" className="w-full sm:w-auto">
              <Link to="/verification">Continue Verification →</Link>
            </Button>
          </div>
        )}

        {/* Verified Skills */}
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

        {/* Certification info */}
        {isFullyVerified && (
          <div className="pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Shield className="h-3 w-3" />
              {roleType === "technical"
                ? "5-Stage Verified • Only 18% of candidates pass"
                : "3-Stage Verified • Only 18% of candidates pass"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SkillPassport;

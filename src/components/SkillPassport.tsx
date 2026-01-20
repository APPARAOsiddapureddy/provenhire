import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, CheckCircle2, Shield, Star, Trophy, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface SkillPassportProps {
  certificationLevel: "A" | "B" | "C" | null;
  skills: string[];
  verificationStatus: string | null;
  aptitudeScore?: number;
  dsaScore?: number;
  interviewScore?: number;
  compact?: boolean;
}

const SkillPassport = ({
  certificationLevel,
  skills,
  verificationStatus,
  aptitudeScore,
  dsaScore,
  interviewScore,
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
  const isVerified = verificationStatus === "verified";

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {isVerified && certificationLevel && levelConfig && (
          <Badge className={cn("gap-1", levelConfig.bgColor, levelConfig.borderColor, levelConfig.textColor)}>
            <levelConfig.icon className="h-3 w-3" />
            ProvenHire {levelConfig.label}
          </Badge>
        )}
        {!isVerified && (
          <Badge variant="secondary" className="gap-1">
            <Shield className="h-3 w-3" />
            Verification Pending
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card className={cn(
      "relative overflow-hidden border-2 transition-all",
      isVerified && levelConfig ? levelConfig.bgColor : "bg-muted/30",
      isVerified && levelConfig ? levelConfig.borderColor : "border-border"
    )}>
      {/* Background decoration */}
      {isVerified && levelConfig && (
        <div className="absolute top-0 right-0 w-32 h-32 opacity-10">
          <div className={cn(
            "w-full h-full rounded-full blur-3xl bg-gradient-to-br",
            levelConfig.color
          )} />
        </div>
      )}

      <CardHeader className="relative pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-14 h-14 rounded-xl flex items-center justify-center",
              isVerified && levelConfig 
                ? `bg-gradient-to-br ${levelConfig.color} text-white shadow-lg`
                : "bg-muted text-muted-foreground"
            )}>
              {isVerified && levelConfig ? (
                <levelConfig.icon className="h-7 w-7" />
              ) : (
                <Shield className="h-7 w-7" />
              )}
            </div>
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                ProvenHire Skill Passport
                {isVerified && (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
              </CardTitle>
              {isVerified && levelConfig ? (
                <p className={cn("text-sm font-medium", levelConfig.textColor)}>
                  {levelConfig.label} - {levelConfig.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Complete verification to unlock
                </p>
              )}
            </div>
          </div>
          {isVerified && levelConfig && (
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
        {/* Scores */}
        {isVerified && (
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-background/60 rounded-lg">
              <p className="text-2xl font-bold text-primary">{aptitudeScore || 0}%</p>
              <p className="text-xs text-muted-foreground">Aptitude</p>
            </div>
            <div className="text-center p-3 bg-background/60 rounded-lg">
              <p className="text-2xl font-bold text-primary">{dsaScore || 0}%</p>
              <p className="text-xs text-muted-foreground">Technical</p>
            </div>
            <div className="text-center p-3 bg-background/60 rounded-lg">
              <p className="text-2xl font-bold text-primary">{interviewScore || 0}%</p>
              <p className="text-xs text-muted-foreground">Interview</p>
            </div>
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
                  {isVerified && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Certification info */}
        {isVerified && (
          <div className="pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Shield className="h-3 w-3" />
              3-Stage Verified • Only 18% of candidates pass
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SkillPassport;

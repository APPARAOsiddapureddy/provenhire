import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Copy, Share2, Gift, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface ReferralStats {
  referralCount: number;
  verifiedCount: number;
}

const ReferAFriend = () => {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ReferralStats>({ referralCount: 0, verifiedCount: 0 });
  const [loading, setLoading] = useState(true);
  
  // Generate a simple referral code based on user id
  const referralCode = user?.id ? `PH-${user.id.slice(0, 8).toUpperCase()}` : "PH-XXXXXX";
  const referralLink = `${window.location.origin}/auth?ref=${referralCode}`;

  useEffect(() => {
    if (user?.id) {
      fetchReferralStats();
    }
  }, [user?.id]);

  const fetchReferralStats = async () => {
    if (!user?.id) return;
    
    try {
      // Get referral stats from profiles table
      const { data: profileData } = await supabase
        .from('profiles')
        .select('referral_count, referral_verified_count')
        .eq('user_id', user.id)
        .single();

      if (profileData) {
        setStats({
          referralCount: profileData.referral_count || 0,
          verifiedCount: profileData.referral_verified_count || 0
        });
      }
    } catch (error) {
      console.error('Error fetching referral stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join ProvenHire",
          text: "Get verified and find your dream job with ProvenHire!",
          url: referralLink,
        });
      } catch (error) {
        // User cancelled or share failed
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-accent/5 to-secondary">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Gift className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Refer a Friend</CardTitle>
            <CardDescription>Invite friends and earn rewards</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Share ProvenHire with your friends. When they complete verification, 
            both of you get priority visibility to recruiters!
          </p>
        </div>

        {/* Referral Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-background/60 rounded-lg text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
            {loading ? (
              <Loader2 className="h-6 w-6 mx-auto animate-spin text-primary" />
            ) : (
              <p className="text-2xl font-bold">{stats.referralCount}</p>
            )}
            <p className="text-xs text-muted-foreground">Friends Invited</p>
          </div>
          <div className="p-3 bg-background/60 rounded-lg text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-500" />
            {loading ? (
              <Loader2 className="h-6 w-6 mx-auto animate-spin text-green-500" />
            ) : (
              <p className="text-2xl font-bold">{stats.verifiedCount}</p>
            )}
            <p className="text-xs text-muted-foreground">Verified</p>
          </div>
        </div>

        {/* Referral Link */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Your Referral Link</label>
          <div className="flex gap-2">
            <Input 
              value={referralLink} 
              readOnly 
              className="text-sm bg-background/60"
            />
            <Button 
              variant="outline" 
              size="icon"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Referral Code */}
        <div className="flex items-center justify-between p-3 bg-background/60 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Your Code</p>
            <p className="font-mono font-bold text-primary">{referralCode}</p>
          </div>
          <Button onClick={handleShare} size="sm" className="bg-gradient-hero hover:opacity-90">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>

        {/* Rewards Info */}
        <div className="p-3 bg-accent/10 rounded-lg border border-accent/20">
          <p className="text-sm font-medium text-accent-foreground">🎁 Referral Rewards</p>
          <ul className="text-xs text-muted-foreground mt-1 space-y-1">
            <li>• Priority profile visibility for both of you</li>
            <li>• Featured badge on your Skill Passport</li>
            <li>• Exclusive access to premium job listings</li>
          </ul>
        </div>

        {/* Referral Progress */}
        {stats.referralCount > 0 && (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              🌟 You've referred {stats.referralCount} friend{stats.referralCount !== 1 ? 's' : ''}!
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              {stats.verifiedCount > 0 
                ? `${stats.verifiedCount} have completed verification. Keep sharing!`
                : "Waiting for them to complete verification..."
              }
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ReferAFriend;

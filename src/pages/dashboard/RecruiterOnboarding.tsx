import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Phone, Globe, Building2, Briefcase, CheckCircle, ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Progress } from "@/components/ui/progress";

const RecruiterOnboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  
  const [formData, setFormData] = useState({
    designation: "",
    phone: "",
    company_website: "",
    industry: "",
    hiring_for: "",
  });

  useEffect(() => {
    if (user) {
      checkOnboardingStatus();
    }
  }, [user]);

  const checkOnboardingStatus = async () => {
    try {
      const { profile } = await api.get<{ profile: any }>("/api/users/recruiter-profile");

      if (profile?.onboardingCompleted) {
        navigate('/dashboard/recruiter');
        return;
      }

      // Pre-fill any existing data
      if (profile) {
        setFormData({
          designation: profile.designation || "",
          phone: profile.phone || "",
          company_website: profile.companyWebsite || "",
          industry: profile.industry || "",
          hiring_for: profile.hiringFor || "",
        });
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.designation || !formData.phone || !formData.industry || !formData.hiring_for) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/users/recruiter-profile", {
        designation: formData.designation,
        phone: formData.phone,
        companyWebsite: formData.company_website || null,
        industry: formData.industry,
        hiringFor: formData.hiring_for,
        onboardingCompleted: true,
      });

      toast.success("Profile completed successfully!");
      navigate('/dashboard/recruiter');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast.error("Failed to save profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const progress = [
    formData.designation,
    formData.phone,
    formData.industry,
    formData.hiring_for,
  ].filter(Boolean).length * 25;

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navbar />
      
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Complete Your Profile</h1>
            <p className="text-muted-foreground">
              Help us personalize your experience and connect you with the right candidates
            </p>
          </div>

          {/* Progress */}
          <div className="mb-8">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Profile completion</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Form Card */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Your Details
              </CardTitle>
              <CardDescription>
                This information helps candidates understand who they'll be working with
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Designation */}
                <div className="space-y-2">
                  <Label htmlFor="designation">Your Designation *</Label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="designation"
                      placeholder="e.g. HR Manager, Talent Acquisition Lead"
                      value={formData.designation}
                      onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+91 999 999 9999"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                {/* Company Website */}
                <div className="space-y-2">
                  <Label htmlFor="website">Company Website (Optional)</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="website"
                      type="url"
                      placeholder="https://company.com"
                      value={formData.company_website}
                      onChange={(e) => setFormData({ ...formData, company_website: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* Industry */}
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry *</Label>
                  <Select
                    value={formData.industry}
                    onValueChange={(value) => setFormData({ ...formData, industry: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your industry" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IT/Software">IT / Software</SelectItem>
                      <SelectItem value="FinTech">FinTech</SelectItem>
                      <SelectItem value="E-commerce">E-commerce</SelectItem>
                      <SelectItem value="Healthcare">Healthcare</SelectItem>
                      <SelectItem value="EdTech">EdTech</SelectItem>
                      <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="Consulting">Consulting</SelectItem>
                      <SelectItem value="Banking/Finance">Banking / Finance</SelectItem>
                      <SelectItem value="Telecom">Telecom</SelectItem>
                      <SelectItem value="Media/Entertainment">Media / Entertainment</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Hiring For */}
                <div className="space-y-2">
                  <Label htmlFor="hiring_for">Primarily Hiring For *</Label>
                  <Select
                    value={formData.hiring_for}
                    onValueChange={(value) => setFormData({ ...formData, hiring_for: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Software Engineering">Software Engineering</SelectItem>
                      <SelectItem value="Data Science/ML">Data Science / ML</SelectItem>
                      <SelectItem value="Product Management">Product Management</SelectItem>
                      <SelectItem value="Design">Design (UI/UX)</SelectItem>
                      <SelectItem value="DevOps/Cloud">DevOps / Cloud</SelectItem>
                      <SelectItem value="QA/Testing">QA / Testing</SelectItem>
                      <SelectItem value="Sales/Marketing">Sales / Marketing</SelectItem>
                      <SelectItem value="Operations">Operations</SelectItem>
                      <SelectItem value="Multiple Roles">Multiple Roles</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Info Box */}
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">What's next?</p>
                      <p className="text-sm text-muted-foreground">
                        Once you complete your profile, you'll have access to our pool of skill-verified candidates and can start posting jobs immediately.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  className="w-full bg-gradient-hero hover:opacity-90"
                  disabled={loading}
                >
                  {loading ? (
                    "Saving..."
                  ) : (
                    <>
                      Complete Profile
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default RecruiterOnboarding;

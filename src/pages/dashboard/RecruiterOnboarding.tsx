import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/PhoneInput";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { User, Phone, Globe, Building2, Briefcase, CheckCircle, ArrowRight, Linkedin, FileCheck, Upload, ImageIcon } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

function RecruiterOnboardingSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navbar />
      <main className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-2xl space-y-8">
          <div className="text-center">
            <Skeleton className="mx-auto mb-4 h-16 w-16 rounded-full" />
            <Skeleton className="mx-auto mb-3 h-9 w-72 max-w-full" />
            <Skeleton className="mx-auto h-4 w-full max-w-lg" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <div className="space-y-6">
            {[1, 2, 3].map((item) => (
              <Card key={item}>
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-72 max-w-full" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Skeleton className="h-11 rounded-md" />
                    <Skeleton className="h-11 rounded-md" />
                  </div>
                  <Skeleton className="h-24 rounded-md" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

const COMPANY_SIZES = [
  { value: "1-10", label: "1–10" },
  { value: "11-50", label: "11–50" },
  { value: "51-200", label: "51–200" },
  { value: "201-500", label: "201–500" },
  { value: "500+", label: "500+" },
];

const RecruiterOnboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [verificationDocUrl, setVerificationDocUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [formData, setFormData] = useState({
    full_name: "",
    work_email: "",
    phone: "",
    designation: "",
    linkedin_profile: "",
    company_name: "",
    company_website: "",
    industry: "",
    company_size: "",
    headquarters: "",
    company_linkedin: "",
    company_description: "",
    hiring_for: "",
  });

  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        work_email: prev.work_email || (user.email ?? ""),
      }));
      checkOnboardingStatus();
    }
  }, [user]);

  const checkOnboardingStatus = async () => {
    try {
      const { profile } = await api.get<{ profile: any }>("/api/users/recruiter-profile");

      if (profile?.onboardingCompleted) {
        navigate("/dashboard/recruiter");
        return;
      }

      if (profile) {
        setFormData({
          full_name: profile.fullName ?? "",
          work_email: profile.workEmail ?? user?.email ?? "",
          phone: profile.phone ?? "",
          designation: profile.designation ?? "",
          linkedin_profile: profile.linkedInProfile ?? "",
          company_name: profile.companyName ?? "",
          company_website: profile.companyWebsite ?? "",
          industry: profile.industry ?? "",
          company_size: profile.companySize ?? "",
          headquarters: profile.headquarters ?? "",
          company_linkedin: profile.companyLinkedin ?? "",
          company_description: profile.companyDescription ?? "",
          hiring_for: profile.hiringFor ?? "",
        });
        if (profile.companyLogo) setCompanyLogoUrl(profile.companyLogo);
        if (profile.verificationDocumentUrl) setVerificationDocUrl(profile.verificationDocumentUrl);
      }
    } catch (error) {
      console.error("Error checking onboarding status:", error);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = /\.(png|jpg|jpeg|gif|webp)$/i.test(file.name) && file.size <= 5 * 1024 * 1024;
    if (!ok) {
      toast.error("Logo must be PNG, JPG, GIF or WebP and under 5MB.");
      return;
    }
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { url } = await api.post<{ url: string }>("/api/uploads", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setCompanyLogoUrl(url);
      toast.success("Logo uploaded.");
    } catch (err: any) {
      toast.error(err?.message || "Logo upload failed.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleVerificationDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = /\.(pdf|jpg|jpeg|png)$/i.test(file.name) && file.size <= 5 * 1024 * 1024;
    if (!ok) {
      toast.error("Document must be PDF, JPG or PNG and under 5MB.");
      return;
    }
    setUploadingDoc(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { url } = await api.post<{ url: string }>("/api/uploads/recruiter-verification-document", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setVerificationDocUrl(url);
      toast.success("Document uploaded.");
    } catch (err: any) {
      toast.error(err?.message || "Document upload failed.");
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.full_name?.trim() ||
      !formData.work_email?.trim() ||
      !formData.phone?.trim() ||
      !formData.designation?.trim() ||
      !formData.linkedin_profile?.trim()
    ) {
      toast.error("Please fill in all required personal fields (Full name, Work email, Phone, Job title, LinkedIn).");
      return;
    }
    if (
      !formData.company_name?.trim() ||
      !formData.company_website?.trim() ||
      !formData.industry ||
      !formData.company_size ||
      !formData.headquarters?.trim() ||
      !formData.company_linkedin?.trim()
    ) {
      toast.error("Please fill in all required company fields (Name, Website, Industry, Size, Location, Company LinkedIn).");
      return;
    }
    if (!companyLogoUrl) {
      toast.error("Please upload a company logo.");
      return;
    }
    if (!verificationDocUrl) {
      toast.error("Please upload at least one verification document (e.g. company registration, GST, business license).");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/users/recruiter-profile", {
        fullName: formData.full_name.trim(),
        workEmail: formData.work_email.trim(),
        phone: formData.phone.trim(),
        designation: formData.designation.trim(),
        linkedInProfile: formData.linkedin_profile.trim() || null,
        companyName: formData.company_name.trim(),
        companyLogo: companyLogoUrl,
        companyWebsite: formData.company_website.trim(),
        industry: formData.industry,
        companySize: formData.company_size,
        headquarters: formData.headquarters.trim(),
        companyLinkedin: formData.company_linkedin.trim(),
        companyDescription: formData.company_description.trim() || null,
        hiringFor: formData.hiring_for || null,
        verificationDocumentUrl: verificationDocUrl,
        onboardingCompleted: true,
      });

      toast.success("Profile submitted. Your account is under review. You can post jobs once verified.");
      navigate("/dashboard/recruiter");
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast.error(error?.message || "Failed to save profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const requiredPersonal = [
    formData.full_name?.trim(),
    formData.work_email?.trim(),
    formData.phone?.trim(),
    formData.designation?.trim(),
    formData.linkedin_profile?.trim(),
  ].filter(Boolean).length;
  const requiredCompany = [
    formData.company_name?.trim(),
    formData.company_website?.trim(),
    formData.industry,
    formData.company_size,
    formData.headquarters?.trim(),
    formData.company_linkedin?.trim(),
    companyLogoUrl,
  ].filter(Boolean).length;
  const progress = Math.min(
    100,
    (requiredPersonal / 5) * 35 + (requiredCompany / 7) * 45 + (verificationDocUrl ? 20 : 0)
  );

  if (checkingStatus) {
    return <RecruiterOnboardingSkeleton />;
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navbar />

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Recruiter verification</h1>
            <p className="text-muted-foreground">
              Complete your profile and upload company documents. Your account will be reviewed before you can post jobs.
            </p>
          </div>

          <div className="mb-8">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Profile completion</span>
              <span className="font-medium">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Personal */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  Personal information
                </CardTitle>
                <CardDescription>Full name, work email, phone, job title, LinkedIn profile</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Full name *</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="Your full name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="work_email">Work email *</Label>
                    <Input
                      id="work_email"
                      type="email"
                      value={formData.work_email}
                      onChange={(e) => setFormData({ ...formData, work_email: e.target.value })}
                      placeholder="you@company.com"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Phone number *</Label>
                  <PhoneInput
                    value={formData.phone}
                    onChange={(v) => setFormData({ ...formData, phone: v })}
                    placeholder="999 999 9999"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="designation">Job title / role *</Label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="designation"
                      value={formData.designation}
                      onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      placeholder="e.g. Recruiter, HR Manager, Talent Acquisition"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linkedin_profile">LinkedIn profile URL *</Label>
                  <div className="relative">
                    <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="linkedin_profile"
                      type="url"
                      value={formData.linkedin_profile}
                      onChange={(e) => setFormData({ ...formData, linkedin_profile: e.target.value })}
                      placeholder="https://linkedin.com/in/yourprofile"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Company */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Company information
                </CardTitle>
                <CardDescription>Company name, logo, website, industry, size, location, LinkedIn</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company name *</Label>
                  <Input
                    id="company_name"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    placeholder="Your company name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Company logo *</Label>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
                      {companyLogoUrl ? (
                        <img src={companyLogoUrl.startsWith("http") ? companyLogoUrl : `${window.location.origin}${companyLogoUrl}`} alt="Logo" className="w-full h-full object-contain" />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.gif,.webp"
                        onChange={handleLogoUpload}
                        className="hidden"
                        id="logo-upload"
                      />
                      <Label htmlFor="logo-upload" className="cursor-pointer">
                        <Button type="button" variant="outline" size="sm" asChild disabled={uploadingLogo}>
                          <span>
                            <Upload className="h-4 w-4 mr-2" />
                            {uploadingLogo ? "Uploading..." : "Upload logo"}
                          </span>
                        </Button>
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF or WebP. Max 5MB.</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_website">Company website *</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="company_website"
                      type="url"
                      placeholder="https://company.com"
                      value={formData.company_website}
                      onChange={(e) => setFormData({ ...formData, company_website: e.target.value })}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Industry *</Label>
                    <Select value={formData.industry} onValueChange={(v) => setFormData({ ...formData, industry: v })}>
                      <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
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
                  <div className="space-y-2">
                    <Label>Company size *</Label>
                    <Select value={formData.company_size} onValueChange={(v) => setFormData({ ...formData, company_size: v })}>
                      <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                      <SelectContent>
                        {COMPANY_SIZES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="headquarters">Company headquarters location *</Label>
                  <Input
                    id="headquarters"
                    value={formData.headquarters}
                    onChange={(e) => setFormData({ ...formData, headquarters: e.target.value })}
                    placeholder="e.g. Bangalore, India"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_linkedin">Company LinkedIn page URL *</Label>
                  <div className="relative">
                    <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="company_linkedin"
                      type="url"
                      value={formData.company_linkedin}
                      onChange={(e) => setFormData({ ...formData, company_linkedin: e.target.value })}
                      placeholder="https://linkedin.com/company/yourcompany"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_description">Company description (optional)</Label>
                  <Textarea
                    id="company_description"
                    value={formData.company_description}
                    onChange={(e) => setFormData({ ...formData, company_description: e.target.value })}
                    placeholder="Brief description of your company"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Primarily hiring for (optional)</Label>
                  <Select value={formData.hiring_for} onValueChange={(v) => setFormData({ ...formData, hiring_for: v })}>
                    <SelectTrigger><SelectValue placeholder="Select role type" /></SelectTrigger>
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
              </CardContent>
            </Card>

            {/* Verification document */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-primary" />
                  Verification document
                </CardTitle>
                <CardDescription>
                  Upload at least one: company registration certificate, GST certificate, business license, or employment proof. PDF, JPG or PNG. Max 5MB.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  {verificationDocUrl && (
                    <a href={verificationDocUrl.startsWith("http") ? verificationDocUrl : `${window.location.origin}${verificationDocUrl}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                      View uploaded document
                    </a>
                  )}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleVerificationDocUpload}
                    className="hidden"
                    id="doc-upload"
                  />
                  <Label htmlFor="doc-upload" className="cursor-pointer">
                    <Button type="button" variant="outline" size="sm" asChild disabled={uploadingDoc}>
                      <span>
                        <Upload className="h-4 w-4 mr-2" />
                        {uploadingDoc ? "Uploading..." : verificationDocUrl ? "Replace document" : "Upload document"}
                      </span>
                    </Button>
                  </Label>
                </div>
              </CardContent>
            </Card>

            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">What happens next?</p>
                  <p className="text-sm text-muted-foreground">
                    Your account will be under review. Once approved, you’ll see a “Verified” badge and can post jobs. If rejected, we’ll show a reason and you can update documents and re-submit.
                  </p>
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full bg-gradient-hero hover:opacity-90" disabled={loading}>
              {loading ? "Saving..." : <>Submit for verification <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default RecruiterOnboarding;

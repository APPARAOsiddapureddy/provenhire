import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Briefcase, ArrowLeft, Upload, Sparkles, FileText, Loader2, X, Eye, MapPin, Clock, DollarSign, Calendar } from "lucide-react";

const PostJob = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    title: "",
    company: "",
    description: "",
    location: "",
    job_type: "",
    salary_range: "",
    experience_required: 0,
    required_skills: [] as string[],
  });
  const [skillInput, setSkillInput] = useState("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a PDF, Word document, or text file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast.error('File size must be less than 10MB');
      return;
    }

    setUploadedFile(file);
    toast.success(`File "${file.name}" uploaded. Click "Parse with AI" to auto-fill fields.`);
  };

  const parseWithAI = async () => {
    if (!uploadedFile) {
      toast.error('Please upload a job description file first');
      return;
    }

    setAiParsing(true);
    try {
      // Read file content
      const content = await readFileContent(uploadedFile);
      
      if (content.length < 50) {
        toast.error('The file content is too short to parse');
        return;
      }

      // Call AI parsing function
      const { data, error } = await supabase.functions.invoke('parse-job-description', {
        body: { content }
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        const parsed = data.data;
        
        setFormData({
          title: parsed.title || formData.title,
          company: parsed.company || formData.company,
          description: parsed.description || formData.description,
          location: parsed.location || formData.location,
          job_type: parsed.job_type || formData.job_type,
          salary_range: parsed.salary_range || formData.salary_range,
          experience_required: parsed.experience_required || formData.experience_required,
          required_skills: parsed.required_skills || formData.required_skills,
        });

        toast.success('Job details extracted successfully! Review and adjust as needed.');
      } else {
        throw new Error(data?.error || 'Failed to parse job description');
      }
    } catch (error: any) {
      console.error('AI parsing error:', error);
      toast.error(error.message || 'Failed to parse job description');
    } finally {
      setAiParsing(false);
    }
  };

  const readFileContent = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      if (file.type === 'text/plain') {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      } else {
        // For PDF/Word, we'll read as text and let the AI handle it
        // In production, you'd want to use a proper document parser
        reader.onload = (e) => {
          const text = e.target?.result as string;
          // Try to extract text content
          resolve(text);
        };
        reader.onerror = reject;
        reader.readAsText(file);
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('Please sign in to post a job');
      return;
    }

    if (!formData.title || !formData.company || !formData.description) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const { data: newJob, error } = await supabase
        .from('jobs')
        .insert({
          recruiter_id: user.id,
          title: formData.title,
          company: formData.company,
          description: formData.description,
          location: formData.location,
          job_type: formData.job_type,
          salary_range: formData.salary_range,
          experience_required: formData.experience_required,
          required_skills: formData.required_skills,
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;

      // Trigger job alert emails for matching subscribers (fire-and-forget)
      if (newJob) {
        supabase.functions.invoke('send-job-alerts', {
          body: {
            jobId: newJob.id,
            jobTitle: newJob.title,
            company: newJob.company,
            requiredSkills: newJob.required_skills || [],
            location: newJob.location,
            salaryRange: newJob.salary_range,
            jobType: newJob.job_type
          }
        }).then(({ error: alertError }) => {
          if (alertError) {
            console.error('Failed to send job alerts:', alertError);
          } else {
            console.log('Job alerts triggered successfully');
          }
        });
      }

      toast.success('Job posted successfully!');
      navigate('/dashboard/recruiter');
    } catch (error: any) {
      console.error('Error posting job:', error);
      toast.error('Failed to post job');
    } finally {
      setLoading(false);
    }
  };

  const addSkill = () => {
    if (skillInput.trim() && !formData.required_skills.includes(skillInput.trim())) {
      setFormData({
        ...formData,
        required_skills: [...formData.required_skills, skillInput.trim()]
      });
      setSkillInput("");
    }
  };

  const removeSkill = (skill: string) => {
    setFormData({
      ...formData,
      required_skills: formData.required_skills.filter(s => s !== skill)
    });
  };

  const removeUploadedFile = () => {
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="bg-background/80 backdrop-blur-md border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold bg-gradient-hero bg-clip-text text-transparent">
              Post New Job
            </h1>
          </div>
          <Button variant="outline" onClick={() => navigate('/dashboard/recruiter')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* AI Upload Section */}
        <Card className="mb-6 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">AI-Powered Auto-Fill</CardTitle>
            </div>
            <CardDescription>
              Upload a job description document and let AI extract the details automatically
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="jd-upload"
                />
                <label
                  htmlFor="jd-upload"
                  className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-primary/30 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                >
                  <Upload className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">
                    {uploadedFile ? uploadedFile.name : 'Upload JD (PDF, Word, TXT)'}
                  </span>
                </label>
              </div>
              <Button
                type="button"
                onClick={parseWithAI}
                disabled={!uploadedFile || aiParsing}
                className="bg-gradient-hero hover:opacity-90"
              >
                {aiParsing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Parse with AI
                  </>
                )}
              </Button>
            </div>
            
            {uploadedFile && (
              <div className="flex items-center gap-2 p-2 bg-background/60 rounded-lg">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm flex-1 truncate">{uploadedFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removeUploadedFile}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manual Form */}
        <Card>
          <CardHeader>
            <CardTitle>Job Details</CardTitle>
            <CardDescription>Fill in the information about your job opening or let AI auto-fill from your document</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Job Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g. Senior Frontend Developer"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company">Company Name *</Label>
                <Input
                  id="company"
                  placeholder="e.g. TechCorp Inc"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Job Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the role, responsibilities, and requirements..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={6}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    placeholder="e.g. San Francisco, CA or Remote"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="job_type">Job Type</Label>
                  <Select value={formData.job_type} onValueChange={(value) => setFormData({ ...formData, job_type: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full-time">Full-time</SelectItem>
                      <SelectItem value="part-time">Part-time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="internship">Internship</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="salary">Salary Range</Label>
                  <Input
                    id="salary"
                    placeholder="e.g. ₹15L - ₹25L or $100k - $150k"
                    value={formData.salary_range}
                    onChange={(e) => setFormData({ ...formData, salary_range: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="experience">Years of Experience Required</Label>
                  <Input
                    id="experience"
                    type="number"
                    min="0"
                    placeholder="e.g. 3"
                    value={formData.experience_required}
                    onChange={(e) => setFormData({ ...formData, experience_required: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="skills">Required Skills</Label>
                <div className="flex gap-2">
                  <Input
                    id="skills"
                    placeholder="Add a skill"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                  />
                  <Button type="button" onClick={addSkill} variant="outline">
                    Add
                  </Button>
                </div>
                {formData.required_skills.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.required_skills.map((skill) => (
                      <div key={skill} className="bg-secondary px-3 py-1 rounded-full text-sm flex items-center gap-2">
                        {skill}
                        <button
                          type="button"
                          onClick={() => removeSkill(skill)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button 
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowPreview(true)}
                  disabled={!formData.title && !formData.company && !formData.description}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Job
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 bg-gradient-hero hover:opacity-90"
                  disabled={loading}
                >
                  {loading ? 'Posting...' : 'Post Job'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Job Preview Dialog */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                Job Listing Preview
              </DialogTitle>
              <DialogDescription>
                This is how candidates will see your job listing
              </DialogDescription>
            </DialogHeader>
            
            <div className="mt-4 space-y-6">
              {/* Job Header */}
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">
                  {formData.title || "Job Title"}
                </h2>
                <p className="text-lg text-muted-foreground">
                  {formData.company || "Company Name"}
                </p>
              </div>

              {/* Job Meta */}
              <div className="flex flex-wrap gap-3">
                {formData.location && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {formData.location}
                  </div>
                )}
                {formData.job_type && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {formData.job_type.charAt(0).toUpperCase() + formData.job_type.slice(1)}
                  </div>
                )}
                {formData.salary_range && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    {formData.salary_range}
                  </div>
                )}
                {formData.experience_required > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {formData.experience_required}+ years experience
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Description</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {formData.description || "No description provided yet."}
                </p>
              </div>

              {/* Skills */}
              {formData.required_skills.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground">Required Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {formData.required_skills.map((skill) => (
                      <Badge key={skill} variant="secondary">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview Footer */}
              <div className="pt-4 border-t border-border">
                <Button className="w-full" disabled>
                  Apply Now
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  This is a preview. The "Apply Now" button will be active after posting.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default PostJob;

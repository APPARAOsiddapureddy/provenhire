export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_messages: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          read_at: string | null
          recipient_id: string
          subject: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          read_at?: string | null
          recipient_id: string
          subject: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          read_at?: string | null
          recipient_id?: string
          subject?: string
        }
        Relationships: []
      }
      ai_interview_responses: {
        Row: {
          ai_feedback: string | null
          ai_score: number | null
          audio_url: string | null
          confidence_score: number | null
          created_at: string
          flag_reason: string | null
          id: string
          is_flagged: boolean | null
          keywords_detected: string[] | null
          question_index: number
          question_text: string
          question_type: string
          response_duration_seconds: number | null
          session_id: string
          transcript: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          ai_feedback?: string | null
          ai_score?: number | null
          audio_url?: string | null
          confidence_score?: number | null
          created_at?: string
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean | null
          keywords_detected?: string[] | null
          question_index: number
          question_text: string
          question_type: string
          response_duration_seconds?: number | null
          session_id: string
          transcript?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          ai_feedback?: string | null
          ai_score?: number | null
          audio_url?: string | null
          confidence_score?: number | null
          created_at?: string
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean | null
          keywords_detected?: string[] | null
          question_index?: number
          question_text?: string
          question_type?: string
          response_duration_seconds?: number | null
          session_id?: string
          transcript?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_interview_responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_interview_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          flag_reason: string | null
          id: string
          is_flagged: boolean | null
          overall_score: number | null
          questions_answered: number
          started_at: string | null
          status: string
          total_questions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean | null
          overall_score?: number | null
          questions_answered?: number
          started_at?: string | null
          status?: string
          total_questions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean | null
          overall_score?: number | null
          questions_answered?: number
          started_at?: string | null
          status?: string
          total_questions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      aptitude_test_results: {
        Row: {
          answers: Json | null
          completed_at: string
          data_integrity_score: number
          difficulty: string
          id: string
          invalidated_at: string | null
          invalidation_reason: string | null
          is_invalidated: boolean | null
          logical_score: number
          passed: boolean
          screen_recording_url: string | null
          time_taken_seconds: number | null
          total_questions: number
          total_score: number
          user_id: string
          verbal_score: number
        }
        Insert: {
          answers?: Json | null
          completed_at?: string
          data_integrity_score?: number
          difficulty?: string
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          is_invalidated?: boolean | null
          logical_score?: number
          passed?: boolean
          screen_recording_url?: string | null
          time_taken_seconds?: number | null
          total_questions?: number
          total_score?: number
          user_id: string
          verbal_score?: number
        }
        Update: {
          answers?: Json | null
          completed_at?: string
          data_integrity_score?: number
          difficulty?: string
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          is_invalidated?: boolean | null
          logical_score?: number
          passed?: boolean
          screen_recording_url?: string | null
          time_taken_seconds?: number | null
          total_questions?: number
          total_score?: number
          user_id?: string
          verbal_score?: number
        }
        Relationships: []
      }
      dsa_round_results: {
        Row: {
          completed_at: string
          difficulty: string
          id: string
          invalidated_at: string | null
          invalidation_reason: string | null
          is_invalidated: boolean | null
          passed: boolean
          problems_attempted: number
          problems_solved: number
          screen_recording_url: string | null
          solutions: Json | null
          time_taken_seconds: number | null
          total_score: number
          user_id: string
        }
        Insert: {
          completed_at?: string
          difficulty?: string
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          is_invalidated?: boolean | null
          passed?: boolean
          problems_attempted?: number
          problems_solved?: number
          screen_recording_url?: string | null
          solutions?: Json | null
          time_taken_seconds?: number | null
          total_score?: number
          user_id: string
        }
        Update: {
          completed_at?: string
          difficulty?: string
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          is_invalidated?: boolean | null
          passed?: boolean
          problems_attempted?: number
          problems_solved?: number
          screen_recording_url?: string | null
          solutions?: Json | null
          time_taken_seconds?: number | null
          total_score?: number
          user_id?: string
        }
        Relationships: []
      }
      expert_interviewers: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          linkedin_url: string | null
          name: string | null
          nda_signed_at: string | null
          public_id: string | null
          rating: number | null
          status: string
          total_interviews_conducted: number
          updated_at: string
          user_id: string | null
          verified_by_admin: boolean
          years_of_experience: number | null
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          linkedin_url?: string | null
          name?: string | null
          nda_signed_at?: string | null
          public_id?: string | null
          rating?: number | null
          status?: string
          total_interviews_conducted?: number
          updated_at?: string
          user_id?: string | null
          verified_by_admin?: boolean
          years_of_experience?: number | null
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          linkedin_url?: string | null
          name?: string | null
          nda_signed_at?: string | null
          public_id?: string | null
          rating?: number | null
          status?: string
          total_interviews_conducted?: number
          updated_at?: string
          user_id?: string | null
          verified_by_admin?: boolean
          years_of_experience?: number | null
        }
        Relationships: []
      }
      interviewer_slots: {
        Row: {
          booked_user_id: string | null
          created_at: string
          domain: string | null
          ends_at: string | null
          id: string
          interviewer_id: string
          public_id: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          booked_user_id?: string | null
          created_at?: string
          domain?: string | null
          ends_at?: string | null
          id?: string
          interviewer_id: string
          public_id?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          booked_user_id?: string | null
          created_at?: string
          domain?: string | null
          ends_at?: string | null
          id?: string
          interviewer_id?: string
          public_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviewer_slots_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "expert_interviewers"
            referencedColumns: ["id"]
          },
        ]
      }
      human_interview_sessions: {
        Row: {
          admin_review_status: string
          completed_at: string | null
          created_at: string
          fraud_flag: boolean
          fraud_notes: string | null
          id: string
          interviewer_id: string
          interviewer_notes: string | null
          public_id: string | null
          recording_url: string | null
          role_type: string | null
          scheduled_at: string | null
          score_breakdown: Json | null
          status: string
          transcript: string | null
          updated_at: string
          user_id: string
          verification_level: string | null
          verification_tier: string | null
          weighted_score: number | null
        }
        Insert: {
          admin_review_status?: string
          completed_at?: string | null
          created_at?: string
          fraud_flag?: boolean
          fraud_notes?: string | null
          id?: string
          interviewer_id: string
          interviewer_notes?: string | null
          public_id?: string | null
          recording_url?: string | null
          role_type?: string | null
          scheduled_at?: string | null
          score_breakdown?: Json | null
          status?: string
          transcript?: string | null
          updated_at?: string
          user_id: string
          verification_level?: string | null
          verification_tier?: string | null
          weighted_score?: number | null
        }
        Update: {
          admin_review_status?: string
          completed_at?: string | null
          created_at?: string
          fraud_flag?: boolean
          fraud_notes?: string | null
          id?: string
          interviewer_id?: string
          interviewer_notes?: string | null
          public_id?: string | null
          recording_url?: string | null
          role_type?: string | null
          scheduled_at?: string | null
          score_breakdown?: Json | null
          status?: string
          transcript?: string | null
          updated_at?: string
          user_id?: string
          verification_level?: string | null
          verification_tier?: string | null
          weighted_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "human_interview_sessions_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "expert_interviewers"
            referencedColumns: ["id"]
          },
        ]
      }
      job_alert_subscriptions: {
        Row: {
          created_at: string
          email: string
          frequency: string
          id: string
          is_active: boolean
          last_sent_at: string | null
          min_match_percentage: number
          skills: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          min_match_percentage?: number
          skills?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          min_match_percentage?: number
          skills?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_applications: {
        Row: {
          applied_at: string | null
          cover_letter: string | null
          id: string
          job_id: string
          job_seeker_id: string
          resume_url: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          applied_at?: string | null
          cover_letter?: string | null
          id?: string
          job_id: string
          job_seeker_id: string
          resume_url: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          applied_at?: string | null
          cover_letter?: string | null
          id?: string
          job_id?: string
          job_seeker_id?: string
          resume_url?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      job_seeker_profiles: {
        Row: {
          actively_looking_roles: string[] | null
          bio: string | null
          certifications: string[] | null
          cgpa: string | null
          college: string | null
          current_company: string | null
          current_role: string | null
          current_salary: string | null
          currently_working: boolean | null
          created_at: string | null
          degree: string | null
          experience_years: number | null
          expected_salary: string | null
          field_of_study: string | null
          graduation_year: number | null
          hobbies: string[] | null
          id: string
          join_date: string | null
          languages: string[] | null
          linkedin_url: string | null
          location: string | null
          notice_period: string | null
          portfolio_url: string | null
          phone: string | null
          profile_views: number | null
          projects: Json | null
          resume_url: string | null
          skills: string[] | null
          updated_at: string | null
          user_id: string
          verification_level: string | null
          verification_public_id: string | null
          verification_public_url: string | null
          verification_status: string | null
          verification_tier: string | null
        }
        Insert: {
          actively_looking_roles?: string[] | null
          bio?: string | null
          certifications?: string[] | null
          cgpa?: string | null
          college?: string | null
          current_company?: string | null
          current_role?: string | null
          current_salary?: string | null
          currently_working?: boolean | null
          created_at?: string | null
          degree?: string | null
          experience_years?: number | null
          expected_salary?: string | null
          field_of_study?: string | null
          graduation_year?: number | null
          hobbies?: string[] | null
          id?: string
          join_date?: string | null
          languages?: string[] | null
          linkedin_url?: string | null
          location?: string | null
          notice_period?: string | null
          portfolio_url?: string | null
          phone?: string | null
          profile_views?: number | null
          projects?: Json | null
          resume_url?: string | null
          skills?: string[] | null
          updated_at?: string | null
          user_id: string
          verification_level?: string | null
          verification_public_id?: string | null
          verification_public_url?: string | null
          verification_status?: string | null
          verification_tier?: string | null
        }
        Update: {
          actively_looking_roles?: string[] | null
          bio?: string | null
          certifications?: string[] | null
          cgpa?: string | null
          college?: string | null
          current_company?: string | null
          current_role?: string | null
          current_salary?: string | null
          currently_working?: boolean | null
          created_at?: string | null
          degree?: string | null
          experience_years?: number | null
          expected_salary?: string | null
          field_of_study?: string | null
          graduation_year?: number | null
          hobbies?: string[] | null
          id?: string
          join_date?: string | null
          languages?: string[] | null
          linkedin_url?: string | null
          location?: string | null
          notice_period?: string | null
          portfolio_url?: string | null
          phone?: string | null
          profile_views?: number | null
          projects?: Json | null
          resume_url?: string | null
          skills?: string[] | null
          updated_at?: string | null
          user_id?: string
          verification_level?: string | null
          verification_public_id?: string | null
          verification_public_url?: string | null
          verification_status?: string | null
          verification_tier?: string | null
        }
        Relationships: []
      }
      jobs: {
        Row: {
          company: string
          created_at: string | null
          description: string | null
          experience_required: number | null
          id: string
          job_type: string | null
          location: string | null
          recruiter_id: string
          required_skills: string[] | null
          salary_range: string | null
          status: string | null
          title: string
          updated_at: string | null
          verification_required: string | null
        }
        Insert: {
          company: string
          created_at?: string | null
          description?: string | null
          experience_required?: number | null
          id?: string
          job_type?: string | null
          location?: string | null
          recruiter_id: string
          required_skills?: string[] | null
          salary_range?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          verification_required?: string | null
        }
        Update: {
          company?: string
          created_at?: string | null
          description?: string | null
          experience_required?: number | null
          id?: string
          job_type?: string | null
          location?: string | null
          recruiter_id?: string
          required_skills?: string[] | null
          salary_range?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          verification_required?: string | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          email: string
          id: string
          is_active: boolean
          source: string | null
          subscribed_at: string
        }
        Insert: {
          email: string
          id?: string
          is_active?: boolean
          source?: string | null
          subscribed_at?: string
        }
        Update: {
          email?: string
          id?: string
          is_active?: boolean
          source?: string | null
          subscribed_at?: string
        }
        Relationships: []
      }
      proctoring_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          severity: string
          test_id: string
          test_type: string
          user_id: string
          violation_details: Json | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          severity?: string
          test_id: string
          test_type: string
          user_id: string
          violation_details?: Json | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          severity?: string
          test_id?: string
          test_type?: string
          user_id?: string
          violation_details?: Json | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          company_website: string | null
          created_at: string | null
          designation: string | null
          email: string | null
          full_name: string | null
          hiring_for: string | null
          id: string
          industry: string | null
          onboarding_completed: boolean | null
          phone: string | null
          referral_count: number | null
          referral_verified_count: number | null
          referred_by_code: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_name?: string | null
          company_website?: string | null
          created_at?: string | null
          designation?: string | null
          email?: string | null
          full_name?: string | null
          hiring_for?: string | null
          id?: string
          industry?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          referral_count?: number | null
          referral_verified_count?: number | null
          referred_by_code?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_name?: string | null
          company_website?: string | null
          created_at?: string | null
          designation?: string | null
          email?: string | null
          full_name?: string | null
          hiring_for?: string | null
          id?: string
          industry?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          referral_count?: number | null
          referral_verified_count?: number | null
          referred_by_code?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referral_code: string
          referred_user_id: string
          referrer_id: string
          status: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          referral_code: string
          referred_user_id: string
          referrer_id: string
          status?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          referral_code?: string
          referred_user_id?: string
          referrer_id?: string
          status?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      saved_jobs: {
        Row: {
          id: string
          job_id: string
          saved_at: string
          user_id: string
        }
        Insert: {
          id?: string
          job_id: string
          saved_at?: string
          user_id: string
        }
        Update: {
          id?: string
          job_id?: string
          saved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      test_appeals: {
        Row: {
          admin_response: string | null
          appeal_reason: string
          created_at: string
          evidence_url: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          supporting_evidence: string | null
          test_id: string
          test_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          appeal_reason: string
          created_at?: string
          evidence_url?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          supporting_evidence?: string | null
          test_id: string
          test_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          appeal_reason?: string
          created_at?: string
          evidence_url?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          supporting_evidence?: string | null
          test_id?: string
          test_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verification_stages: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          score: number | null
          stage_name: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          score?: number | null
          stage_name: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          score?: number | null
          stage_name?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      jobs_public: {
        Row: {
          company: string | null
          created_at: string | null
          description: string | null
          experience_required: number | null
          id: string | null
          job_type: string | null
          location: string | null
          required_skills: string[] | null
          salary_range: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          description?: string | null
          experience_required?: number | null
          id?: string | null
          job_type?: string | null
          location?: string | null
          required_skills?: string[] | null
          salary_range?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          description?: string | null
          experience_required?: number | null
          id?: string | null
          job_type?: string | null
          location?: string | null
          required_skills?: string[] | null
          salary_range?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      email_login_status: {
        Args: { email: string }
        Returns: Json
      }
      get_user_id_from_referral_code: {
        Args: { code: string }
        Returns: string
      }
      get_user_role: {
        Args: { user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_jobseeker: { Args: { _user_id: string }; Returns: boolean }
      is_recruiter: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "recruiter" | "jobseeker" | "admin" | "expert_interviewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["recruiter", "jobseeker", "admin", "expert_interviewer"],
    },
  },
} as const

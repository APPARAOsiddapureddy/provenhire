import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Eligibility = {
  admin_review_status: string;
  requires_payment: boolean;
  can_access_payment_page: boolean;
  can_access_slots: boolean;
  block_human_interview_section: boolean;
  razorpay_key_id: string | null;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(s);
  });
}

export default function HumanInterviewPaymentPage() {
  const navigate = useNavigate();
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const e = await api.get<Eligibility>("/api/human-interview/eligibility");
        setEligibility(e);
        if (e.block_human_interview_section) {
          toast.message("This page isn’t available yet.");
          navigate("/dashboard/jobseeker", { replace: true });
          return;
        }
        if (!e.can_access_payment_page) {
          if (e.can_access_slots) {
            navigate("/human-interview/slots", { replace: true });
          } else {
            navigate("/dashboard/jobseeker", { replace: true });
          }
        }
      } catch {
        toast.error("Could not load payment status");
        navigate("/dashboard/jobseeker", { replace: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const startRazorpay = async () => {
    setPaying(true);
    try {
      const order = await api.post<{
        orderId: string;
        amount: number;
        currency: string;
        keyId?: string;
      }>("/api/human-interview/payment/create-order", {});
      if (!order.keyId) {
        toast.error("Payment gateway not configured");
        return;
      }
      await loadRazorpayScript();
      const R = window.Razorpay;
      if (!R) {
        toast.error("Could not load checkout");
        return;
      }
      const inst = new R({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "ProvenHire",
        description: "Human Expert Interview",
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await api.post("/api/human-interview/payment/verify", {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            toast.success("Payment successful");
            navigate("/human-interview/slots", { replace: true });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Verification failed";
            toast.error(msg);
          }
        },
        modal: {
          ondismiss: () => setPaying(false),
        },
      });
      inst.open();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not start payment";
      toast.error(msg);
    } finally {
      setPaying(false);
    }
  };

  const mockPay = async () => {
    setPaying(true);
    try {
      await api.post("/api/human-interview/payment/mock-success", {});
      toast.success("Payment recorded (dev)");
      navigate("/human-interview/slots", { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Mock payment failed";
      toast.error(msg);
    } finally {
      setPaying(false);
    }
  };

  if (loading || !eligibility) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-lg py-12">
      <Card>
        <CardHeader>
          <CardTitle>Human Expert Interview — payment</CardTitle>
          <CardDescription>
            Complete payment of ₹399 to unlock slot booking. Your first booking after your initial approval was free;
            retries after admin rejection require this fee.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" disabled={paying} onClick={() => void startRazorpay()}>
            {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pay ₹399 with Razorpay"}
          </Button>
          {import.meta.env.DEV && (
            <Button variant="outline" className="w-full" disabled={paying} onClick={() => void mockPay()}>
              Dev: skip payment
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard/jobseeker")}>
            Back to dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

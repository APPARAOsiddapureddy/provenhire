import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="light"
    position="top-right"
    offset={16}
    expand={false}
    closeButton
    className="ph-sonner-toaster"
    toastOptions={{
      duration: 4000,
      classNames: {
        toast: "ph-toast",
        title: "ph-toast-title",
        description: "ph-toast-description",
        success: "ph-toast-success",
        error: "ph-toast-error",
        warning: "ph-toast-warning",
        info: "ph-toast-info",
        actionButton: "ph-toast-action",
        cancelButton: "ph-toast-cancel",
        closeButton: "ph-toast-close",
      },
    }}
    {...props}
  />
);

export { Toaster, toast };

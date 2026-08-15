import { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Vaultgram ErrorBoundary] Uncaught runtime exception:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100 font-sans selection:bg-zinc-800">
          <div className="w-full max-w-xl bg-zinc-950 border border-red-900/60 rounded-md p-6 shadow-2xl space-y-4 animate-in fade-in duration-150">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-red-950/60 border border-red-900/80 text-red-400 shrink-0">
                <AlertCircle className="h-5 w-5 stroke-[1.75px]" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
                  Runtime Exception
                </h1>
                <p className="text-xs text-zinc-400">
                  An unexpected exception occurred during component rendering.
                </p>
              </div>
            </div>

            {/* Error Details */}
            <div className="space-y-2">
              <div className="text-[11px] font-mono text-zinc-400">Error Message:</div>
              <div className="p-3 bg-zinc-900/90 border border-zinc-800/80 rounded-sm font-mono text-xs text-red-300 break-words">
                {this.state.error?.message || "Unknown runtime error"}
              </div>
            </div>

            {/* Stack trace */}
            {this.state.error?.stack && (
              <div className="space-y-2">
                <div className="text-[11px] font-mono text-zinc-400">Stack Trace:</div>
                <pre className="p-3 bg-zinc-900/90 border border-zinc-800/80 rounded-sm font-mono text-[11px] text-zinc-400 overflow-x-auto max-h-48 whitespace-pre-wrap leading-relaxed">
                  {this.state.error.stack}
                </pre>
              </div>
            )}

            {/* Action Bar */}
            <div className="pt-2 flex items-center justify-between border-t border-zinc-800/60">
              <span className="text-[11px] font-mono text-zinc-500">
                Vaultgram Industrial Diagnostic
              </span>
              <Button
                onClick={this.handleReload}
                size="sm"
                className="gap-2 h-8 px-4 text-xs font-medium bg-zinc-100 text-zinc-950 hover:bg-zinc-200 rounded-sm"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reload Application
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

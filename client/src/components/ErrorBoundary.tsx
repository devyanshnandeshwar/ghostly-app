import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { RotateCw, Ghost } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
}

/**
 * Catches render errors below it.
 *
 * There was no boundary anywhere, so any render error -- a malformed key from
 * the relay, a failed lazy chunk, a provider used outside its own tree --
 * unmounted the whole application to a blank white page with no recovery and
 * no report. Suspense sits around the lazy routes but catches pending states,
 * not rejections, so a chunk that fails to load blanked the page too.
 */
export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // Console for now. This is the seam an error reporter plugs into, and
        // the absence of one is tracked separately as an open finding.
        console.error("[ErrorBoundary]", error, info.componentStack);
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background p-6 text-center text-foreground">
                <div className="grid size-16 place-items-center rounded-full bg-destructive/10">
                    <Ghost className="size-8 text-destructive" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold">Something broke</h1>
                    <p className="max-w-md text-muted-foreground">
                        That is our fault, not yours. Reloading usually clears it — your
                        conversation is not stored, so nothing is lost.
                    </p>
                </div>
                <Button onClick={() => window.location.reload()} size="lg" className="gap-2">
                    <RotateCw className="size-4" />
                    Reload
                </Button>
            </div>
        );
    }
}

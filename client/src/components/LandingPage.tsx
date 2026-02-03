import { Ghost, ArrowRight, Shield, Zap, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface LandingPageProps {
  onStart: () => void;
}

export function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] w-full max-w-5xl mx-auto space-y-12 text-center p-6">
      
      {/* Hero Section */}
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-10 duration-700">
        <div className="flex justify-center">
            <Badge variant="outline" className="px-4 py-1 text-base border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
              <Ghost className="mr-2 h-4 w-4" />
              Anonymous & Secure
            </Badge>
        </div>
        
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight lg:text-8xl">
            Ghostly
        </h1>
        
        <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Experience the future of anonymous connection. 
          <br className="hidden md:block" />
          Verified identities. Total privacy.
        </p>

        <div className="pt-4">
             <Button 
                size="lg" 
                onClick={onStart} 
                className="text-lg px-8 py-6 rounded-full shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:scale-105"
            >
                Start Messaging <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <p className="mt-4 text-sm text-muted-foreground">
                No registration required. Just verify and chat.
            </p>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300 fill-mode-backwards">
        <FeatureCard 
          icon={<Shield className="h-10 w-10 text-primary" />}
          title="Verified Profiles"
          description="AI-powered gender verification ensures real connections."
        />
        <FeatureCard 
          icon={<Lock className="h-10 w-10 text-primary" />}
          title="E2E Encrypted"
          description="Your messages are encrypted. We can't read them."
        />
        <FeatureCard 
          icon={<Zap className="h-10 w-10 text-primary" />}
          title="Instant Match"
          description="Connect with available partners in milliseconds."
        />
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50 hover:bg-card hover:border-border transition-all duration-300">
      <CardHeader className="flex flex-col items-center pb-2">
        <div className="p-3 bg-primary/10 rounded-full mb-2">
            {icon}
        </div>
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{description}</p>
      </CardContent>
    </Card>
  );
}

import { Button } from "@/components/ui/button"
import { ArrowRight, CheckCircle2 } from "lucide-react"

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-background">
      {/* Navigation */}
      <nav className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary" />
            <span className="text-xl font-bold text-foreground">TaskFlow</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </a>
            <Button variant="ghost" size="sm">
              Sign In
            </Button>
            <Button size="sm">Get Started</Button>
          </div>
        </div>
      </nav>

      {/* Hero Content */}
      <div className="container mx-auto px-4 py-20 md:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm text-secondary-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span>Trusted by 10,000+ teams worldwide</span>
          </div>

          <h1 className="mb-6 text-5xl md:text-7xl font-bold tracking-tight text-balance">
            Manage projects with <span className="text-primary">clarity</span> and{" "}
            <span className="text-accent">confidence</span>
          </h1>

          <p className="mb-10 text-lg md:text-xl text-muted-foreground text-balance leading-relaxed max-w-2xl mx-auto">
            TaskFlow helps teams stay organized, collaborate seamlessly, and deliver projects on time. Simple, powerful,
            and built for modern teams.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="text-base px-8">
              Start Free Trial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 bg-transparent">
              Watch Demo
            </Button>
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            No credit card required • Free 14-day trial • Cancel anytime
          </p>
        </div>

        {/* Hero Image/Visual */}
        <div className="mx-auto mt-16 max-w-5xl">
          <div className="relative rounded-xl border border-border bg-card p-4 shadow-2xl">
            <img src="/modern-project-dashboard.png" alt="TaskFlow Dashboard" className="w-full rounded-lg" />
          </div>
        </div>
      </div>

      {/* Social Proof */}
      <div className="border-t border-border bg-muted/30">
        <div className="container mx-auto px-4 py-12">
          <p className="text-center text-sm text-muted-foreground mb-8">Trusted by leading teams at</p>
          <div className="flex flex-wrap items-center justify-center gap-12 opacity-60">
            <div className="text-2xl font-bold">Acme Corp</div>
            <div className="text-2xl font-bold">TechStart</div>
            <div className="text-2xl font-bold">Innovate</div>
            <div className="text-2xl font-bold">BuildCo</div>
            <div className="text-2xl font-bold">DesignHub</div>
          </div>
        </div>
      </div>
    </section>
  )
}

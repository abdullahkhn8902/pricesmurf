import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, Users, Zap } from "lucide-react"

const features = [
  {
    icon: CheckCircle2,
    title: "Task Management",
    description:
      "Create, assign, and track tasks with ease. Set priorities, deadlines, and dependencies to keep your team aligned and productive.",
    image: "/task-management-kanban.png",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description:
      "Real-time updates, comments, and file sharing keep everyone on the same page. Collaborate seamlessly across departments and time zones.",
    image: "/team-collaboration-chat-and-comments-interface.jpg",
  },
  {
    icon: Zap,
    title: "Workflow Automation",
    description:
      "Automate repetitive tasks and streamline your processes. Set up custom workflows that save time and reduce manual work.",
    image: "/workflow-automation-diagram-interface.jpg",
  },
]

export function Features() {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-balance">Everything you need to manage projects</h2>
          <p className="text-lg text-muted-foreground text-balance">
            Powerful features designed to help your team work smarter, not harder
          </p>
        </div>

        <div className="grid gap-8 md:gap-12">
          {features.map((feature, index) => (
            <Card key={index} className="overflow-hidden border-border">
              <CardContent className="p-0">
                <div
                  className={`grid md:grid-cols-2 gap-8 items-center ${index % 2 === 1 ? "md:grid-flow-dense" : ""}`}
                >
                  <div className={`p-8 md:p-12 ${index % 2 === 1 ? "md:col-start-2" : ""}`}>
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-6">
                      <feature.icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold mb-4">{feature.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                  </div>
                  <div className={`bg-muted/50 ${index % 2 === 1 ? "md:col-start-1 md:row-start-1" : ""}`}>
                    <img
                      src={feature.image || "/placeholder.svg"}
                      alt={feature.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

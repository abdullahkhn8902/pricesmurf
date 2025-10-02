"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataQualityModal } from "@/components/data-quality-modal"
import { MarginLeakageModal } from "@/components/margin-leakage-modal"
import { Database, FileCheck, TrendingUp, TrendingDown } from "lucide-react"

const agents = [
  {
    id: "data-quality",
    title: "Data Quality Agent",
    description: "Comprehensive data validation and quality assessment",
    specialty: "Checks missing values, duplicates, outliers, logical rules",
    icon: Database,
    color: "bg-blue-500",
    available: true,
  },
  {
    id: "margin-leakage",
    title: "Margin Leakage Agent",
    description: "Identify products/customers sold below target margin",
    specialty: "Detects below-cost sales, low margins, extreme discounts",
    icon: TrendingDown,
    color: "bg-red-500",
    available: true,
  },
  {
    id: "performance",
    title: "Opportunity Agent",
    description: "Suggest where we can increase price or upsell.",
    specialty: "Spot high-impact pricing & upsell opportunities; make queries faster so recommendations arrive quickly",
    icon: TrendingUp,
    color: "bg-orange-500",
    available: false,
  },
  {
    id: "schema",
    title: "Win Loss Agent",
    description: "Analyze deals marked as won or lost and find patterns.",
    specialty: "Clean and standardize deal data so patterns are clear — fixes inconsistent fields, missing values, and naming",
    icon: FileCheck,
    color: "bg-purple-500",
    available: false,
  }

]

export default function AgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-foreground">AI Data Agents</h1>
          <p className="text-muted-foreground mt-2">
            Intelligent agents for data validation, analysis, and optimization
          </p>
        </div>
      </div>

      {/* Agents Grid */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => {
            const IconComponent = agent.icon
            return (
              <Card key={agent.id} className="relative overflow-hidden hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${agent.color} text-white`}>
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg">{agent.title}</CardTitle>
                      {!agent.available && (
                        <Badge variant="secondary" className="mt-1">
                          Coming Soon
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <CardDescription className="text-sm">{agent.description}</CardDescription>

                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-xs text-muted-foreground font-medium mb-1">SPECIALTY</p>
                    <p className="text-sm">{agent.specialty}</p>
                  </div>

                  <Button className="w-full" disabled={!agent.available} onClick={() => setSelectedAgent(agent.id)}>
                    {agent.available ? `Try ${agent.title}` : "Coming Soon"}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Data Quality Modal */}
      {selectedAgent === "data-quality" && <DataQualityModal isOpen={true} onClose={() => setSelectedAgent(null)} />}

      {selectedAgent === "margin-leakage" && (
        <MarginLeakageModal isOpen={true} onClose={() => setSelectedAgent(null)} />
      )}
    </div>
  )
}

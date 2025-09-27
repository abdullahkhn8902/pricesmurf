import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import "./globals.css"
import cn from "classnames"
import { ClerkProvider } from '@clerk/nextjs'
import ClientLayout from "@/component-app/ClientLayout";



export const metadata: Metadata = {
  title: "Pricesmurf",
  description: "App description",
};

// Add this validation
const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!clerkPubKey) {
  throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable");
}


export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={cn("min-h-screen bg-background font-sans antialiased", GeistSans.variable)}>
        <ClerkProvider
          publishableKey={clerkPubKey}
          appearance={{
            variables: { colorPrimary: '#000000' },
            elements: {
              formButtonPrimary: 'bg-black border border-black border-solid hover:bg-white hover:text-black',
            }
          }}>
          <ClientLayout>{children}</ClientLayout>
        </ClerkProvider>
      </body>
    </html>
  )
}

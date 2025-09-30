'use client';

import { Footer } from "@/component-landing/Footer";
import { InfiniteMovingCardsDemo } from "@/component-landing/Testimonials";
import { FAQAccordion } from "@/component-landing/FAQs";
import { WobbleCardDemo } from "@/component-landing/wooblecards";
import BackgroundLinesDemo from "./landing-pages/hero/page";
import HeroScrollDemo from "./landing-pages/screen-upload/page";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Hourglass } from "ldrs/react";

export default function Home() {
  const { isSignedIn, isLoaded, user } = useUser();
  const router = useRouter();
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    const checkUserData = async () => {
      if (isLoaded && isSignedIn && user) {
        setShowLoader(true);

        try {
          const response = await fetch('/api/check-user-data');

          if (!response.ok) {
            throw new Error('Failed to check user data');
          }

          const data = await response.json();

          // Redirect based on whether user has data
          if (data.hasData) {
            router.push("/app-pages/dashboard");
          } else {
            router.push("/app-pages/createOrUpload");
          }
        } catch (error) {
          console.error("Error checking user data:", error);
          // Fallback redirect if there's an error
          router.push("/app-pages/createOrUpload");
        }
      }
    };

    checkUserData();
  }, [isSignedIn, isLoaded, router, user]);

  if (showLoader) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-white">
        <Hourglass size="45" bgOpacity="0.1" speed="1.75" color="#312e81" />
      </div>
    );
  }

  return (
    <>
      <BackgroundLinesDemo />
      <HeroScrollDemo />
      <WobbleCardDemo />
      <InfiniteMovingCardsDemo />
      <FAQAccordion />
      <Footer />
    </>
  );
}

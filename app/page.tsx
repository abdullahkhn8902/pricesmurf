'use client';

import Image from "next/image";
import { Footer } from "@/component-landing/Footer";
import { InfiniteMovingCardsDemo } from "@/component-landing/Testimonials";
import { FAQAccordion } from "@/component-landing/FAQs";
import { WobbleCardDemo } from "@/component-landing/wooblecards";
import BackgroundLinesDemo from "./landing-pages/hero/page";
import { HeroScrollDemo } from "./landing-pages/screen-upload/page";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Hourglass } from "ldrs/react";
import "ldrs/react/Hourglass.css";

export default function Home() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setShowLoader(true);

      const timer = setTimeout(() => {
        router.push("/app-pages/upload");
      }, 1500); // 1.5s delay before redirect

      return () => clearTimeout(timer);
    }
  }, [isSignedIn, isLoaded, router]);

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

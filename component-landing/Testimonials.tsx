"use client";

import React, { useEffect, useState } from "react";
import { InfiniteMovingCards } from "./ui/infinite-moving-cards";

export function InfiniteMovingCardsDemo() {
    return (
        <section className="bg-white">
            <div className="h-[40rem] rounded-md flex flex-col antialiased  items-center justify-center relative overflow-hidden">
                <h1 className="text-4xl font-semibold text-indigo-900  m-5">
                    What our clients say<br />
                </h1>
                <InfiniteMovingCards
                    items={testimonials}
                    direction="right"
                    speed="normal"
                />
            </div>
        </section>
    );
}

const testimonials = [
    {
        quote: "Pricesmurf transformed our data management, making it the best of times for our business!",
        name: "John Doe",
        title: "CEO, DataSync Inc.",
    },
    {
        quote: "To use or not to use AI? Pricesmurf ended that debate with its powerful analysis tools.",
        name: "Jane Smith",
        title: "CTO, InsightCorp",
    },
    {
        quote: "Our data insights with Pricesmurf feel like a dream come true.",
        name: "Alex Brown",
        title: "Manager, OptiData",
    },
    {
        quote: "Pricesmurf proved that smart data solutions are a universal need for success.",
        name: "Emily White",
        title: "Founder, GrowEasy",
    },
    {
        quote: "With Pricesmurf, we sailed through our data challenges effortlessly.",
        name: "Michael Green",
        title: "Director, SeaAnalytics",
    },
];

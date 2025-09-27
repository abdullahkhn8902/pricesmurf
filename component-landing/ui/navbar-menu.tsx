"use client";
import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";

const transition = {
    type: "spring",
    mass: 0.5,
    damping: 11.5,
    stiffness: 100,
    restDelta: 0.001,
    restSpeed: 0.001,
} as const;

export const MenuItem = ({
    setActive,
    active,
    item,
    children,
    href,
}: {
    setActive: (item: string) => void;
    active: string | null;
    item: string;
    children?: React.ReactNode;
    href?: string;
}) => {
    return (
        <div onMouseEnter={() => setActive(item)} className="relative">
            {href ? (
                <Link href={href}>
                    <motion.span
                        transition={{ duration: 0.3 }}
                        className="cursor-pointer text-white hover:opacity-[0.9] "
                    >
                        {item}
                    </motion.span>
                </Link>
            ) : (
                <motion.span
                    transition={{ duration: 0.3 }}
                    className="cursor-pointer text-white hover:opacity-[0.9] "
                >
                    {item}
                </motion.span>
            )}
            {active !== null && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.85, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={transition}
                >
                    {active === item && (
                        <div className="absolute top-[calc(100%_+_1.2rem)] left-1/2 transform -translate-x-1/2 pt-4">
                            <motion.div
                                transition={transition}
                                layoutId="active"
                                className="bg-white  backdrop-blur-sm rounded-2xl overflow-hidden border border-black/[0.2]  shadow-xl"
                            >
                                <motion.div layout className="w-max h-full p-4">
                                    {children}
                                </motion.div>
                            </motion.div>
                        </div>
                    )}
                </motion.div>
            )}
        </div>
    );
};

export const Menu = ({
    setActive,
    children,
}: {
    setActive: (item: string | null) => void;
    children: React.ReactNode;
}) => {
    return (
        <nav
            onMouseLeave={() => setActive(null)}
            className="relative rounded-full border border-transparent  bg-[#1a237e] shadow-input flex justify-center space-x-4 px-8 text-white"
        >
            {children}
        </nav>
    );
};

export const ProductItem = ({
    title,
    description,
    href,
    src,
}: {
    title: string;
    description: string;
    href: string;
    src: string;
}) => {
    return (
        <Link href={href} className="flex space-x-2">
            <img
                src={src}
                width={140}
                height={70}
                alt={title}
                className="shrink-0 rounded-md shadow-2xl"
            />
            <div>
                <h4 className="text-xl font-bold mb-1 text-black ">
                    {title}
                </h4>
                <p className="text-neutral-700 text-sm max-w-[10rem] ">
                    {description}
                </p>
            </div>
        </Link>
    );
};

export const HoveredLink = ({ children, ...rest }: any) => {
    return (
        <Link
            {...rest}
            className="text-neutral-700  hover:text-black"
        >
            {children}
        </Link>
    );
};
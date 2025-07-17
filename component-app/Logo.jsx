import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export const Logo = ({ isIcon = false }) => {
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (isIcon) {
        // Render only the icon part (LogoIcon)
        return (
            <a
                href="#"
                className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-white"
            >
                <div className="h-5 w-6 shrink-0 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-black dark:bg-white" />
            </a>
        );
    }

    // Render full logo
    return (
        <a
            href="/dashboard"
            className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-white"
        >
            <div className="h-5 w-6 shrink-0 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-black dark:bg-white" />
            <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="font-bold text-xl whitespace-pre text-white dark:text-white"
            >
                AI CRM
            </motion.span>
        </a>
    );
};

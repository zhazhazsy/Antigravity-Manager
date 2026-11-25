import type { CSSProperties } from 'react';

export interface BrandIconProps {
    size?: number | string;
    className?: string;
    style?: CSSProperties;
}

function GeminiSvg({ size = 16, className, style }: BrandIconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            className={className}
            style={style}
            aria-hidden="true"
        >
            <defs>
                <linearGradient id="brand-gemini-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1C69FF" />
                    <stop offset="50%" stopColor="#8E54E9" />
                    <stop offset="100%" stopColor="#F06449" />
                </linearGradient>
            </defs>
            <path
                d="M12 2C12.35 7.42 16.58 11.65 22 12C16.58 12.35 12.35 16.58 12 22C11.65 16.58 7.42 12.35 2 12C7.42 11.65 11.65 7.42 12 2Z"
                fill="url(#brand-gemini-grad)"
            />
        </svg>
    );
}

function ClaudeSvg({ size = 16, className, style }: BrandIconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            className={className}
            style={style}
            aria-hidden="true"
        >
            <path
                d="M12 2.5L13.7 7.8L18.2 4.5L16.1 9.7L21.5 10.6L16.8 13.4L20.4 17.6L15.1 16.4L15.4 21.8L12 17.3L8.6 21.8L8.9 16.4L3.6 17.6L7.2 13.4L2.5 10.6L7.9 9.7L5.8 4.5L10.3 7.8L12 2.5Z"
                fill="#D97757"
            />
        </svg>
    );
}

function OpenAISvg({ size = 16, className, style }: BrandIconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            className={className}
            style={style}
            aria-hidden="true"
        >
            <circle cx="12" cy="12" r="9" stroke="#10A37F" strokeWidth="2.2" />
            <circle cx="12" cy="12" r="3.5" fill="#10A37F" />
        </svg>
    );
}

export const Gemini = Object.assign(GeminiSvg, { Color: GeminiSvg, Avatar: GeminiSvg });
export const Claude = Object.assign(ClaudeSvg, { Color: ClaudeSvg, Avatar: ClaudeSvg });
export const OpenAI = Object.assign(OpenAISvg, { Color: OpenAISvg, Avatar: OpenAISvg });

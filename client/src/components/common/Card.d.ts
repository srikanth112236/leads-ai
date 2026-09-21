import React from 'react';
interface CardProps {
    children: React.ReactNode;
    className?: string;
    title?: string;
}
declare const Card: React.FC<CardProps>;
export default Card;

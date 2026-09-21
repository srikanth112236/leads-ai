import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '', title }) => {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] p-5 ${className}`}>
      {title && <h3 className="text-sm font-extrabold text-slate-900 mb-3">{title}</h3>}
      {children}
    </div>
  );
};

export default Card;

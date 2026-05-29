"use client";

import { type CSSProperties, type ReactNode, useState } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  collapsedLines?: 1 | 2 | 3;
};

export function ExpandableNoteText({ children, className = "", collapsedLines = 2 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const collapsedStyle: CSSProperties | undefined = expanded
    ? undefined
    : {
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: collapsedLines,
        display: "-webkit-box",
        overflow: "hidden",
      };

  return (
    <span
      className={`pet-note-text block w-full cursor-pointer text-left ${className}`}
      style={collapsedStyle}
      aria-expanded={expanded}
      onClick={(event) => {
        event.stopPropagation();
        setExpanded((current) => !current);
      }}
    >
      {children}
    </span>
  );
}

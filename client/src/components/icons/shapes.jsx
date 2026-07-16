// Answer-tile shape icons, SVG markup identical to the source app.
// Order convention (answer index): Triangle, Rhombus, Circle, Square, Star,
// Hexagon. Star/Hexagon are local additions for the optional 5th/6th answers.

export const Triangle = ({ className, fill = '#FFF' }) => (
  <svg className={className} fill={fill} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <polygon points="256 32 20 464 492 464 256 32" />
  </svg>
)

export const Rhombus = ({ className, fill = '#FFF' }) => (
  <svg
    className={className}
    fill={fill}
    viewBox="-56.32 -56.32 624.64 624.64"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g transform="rotate(45 256 256)">
      <rect x="48" y="48" width="416" height="416" />
    </g>
  </svg>
)

export const Circle = ({ className, fill = '#FFF' }) => (
  <svg className={className} viewBox="0 0 512 512" version="1.1" xmlns="http://www.w3.org/2000/svg">
    <g id="Page-1" stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
      <g id="icon" fill={fill} transform="translate(42.666667, 42.666667)">
        <path
          d="M213.333333,3.55271368e-14 C331.15408,3.55271368e-14 426.666667,95.5125867 426.666667,213.333333 C426.666667,331.15408 331.15408,426.666667 213.333333,426.666667 C95.5125867,426.666667 3.55271368e-14,331.15408 3.55271368e-14,213.333333 C3.55271368e-14,95.5125867 95.5125867,3.55271368e-14 213.333333,3.55271368e-14 Z"
          id="Combined-Shape"
        ></path>
      </g>
    </g>
  </svg>
)

export const Square = ({ className, fill = '#FFF' }) => (
  <svg className={className} fill={fill} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect x="48" y="48" width="416" height="416" />
  </svg>
)

export const Star = ({ className, fill = '#FFF' }) => (
  <svg className={className} fill={fill} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <polygon points="256 26 312 179 475 185 346 285 391 442 256 351 121 442 166 285 37 185 200 179" />
  </svg>
)

export const Hexagon = ({ className, fill = '#FFF' }) => (
  <svg className={className} fill={fill} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <polygon points="256 26 455 141 455 371 256 486 57 371 57 141" />
  </svg>
)

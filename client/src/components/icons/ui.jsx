// Minimal line/solid UI icons for the manager dashboard. Inline SVG using
// `currentColor`, matching the app's hand-rolled icon convention (icons/
// shapes.jsx) — no icon-library dependency. Decorative by default
// (aria-hidden); pass aria-label/role to make one meaningful.

const Line = ({ className = 'h-4 w-4', children, ...props }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    {children}
  </svg>
)

const Solid = ({ className = 'h-4 w-4', children, ...props }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    {children}
  </svg>
)

export const PlusIcon = (props) => (
  <Line {...props}>
    <path d="M12 5v14M5 12h14" />
  </Line>
)

export const PlayIcon = (props) => (
  <Solid {...props}>
    <path d="M7 4.5v15a1 1 0 0 0 1.52.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" />
  </Solid>
)

export const PauseIcon = (props) => (
  <Solid {...props}>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </Solid>
)

export const StopIcon = (props) => (
  <Solid {...props}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </Solid>
)

export const ReplayIcon = (props) => (
  <Line {...props}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v6h6" />
  </Line>
)

export const VolumeIcon = (props) => (
  <Line {...props}>
    <path d="M4 10v4h4l5 4V6L8 10H4Z" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
  </Line>
)

export const EyeIcon = (props) => (
  <Line {...props}>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Line>
)

export const SaveIcon = (props) => (
  <Line {...props}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M17 21v-8H7v8M7 3v5h8" />
  </Line>
)

export const MonitorIcon = (props) => (
  <Line {...props}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 21h8M12 16v5" />
  </Line>
)

export const PhoneIcon = (props) => (
  <Line {...props}>
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <path d="M11 18h2" />
  </Line>
)

export const CheckCircleIcon = (props) => (
  <Line {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 12 2 2 4-5" />
  </Line>
)

export const AlertTriangleIcon = (props) => (
  <Line {...props}>
    <path d="M10.3 4.3 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </Line>
)

export const PencilIcon = (props) => (
  <Line {...props}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
  </Line>
)

export const DotsVerticalIcon = (props) => (
  <Solid {...props}>
    <circle cx="12" cy="5" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="12" cy="19" r="1.7" />
  </Solid>
)

export const UserIcon = (props) => (
  <Line {...props}>
    <path d="M20 21a8 8 0 0 0-16 0" />
    <circle cx="12" cy="7" r="4" />
  </Line>
)

export const ChevronDownIcon = (props) => (
  <Line {...props}>
    <path d="m6 9 6 6 6-6" />
  </Line>
)

export const UsersIcon = (props) => (
  <Line {...props}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Line>
)

export const LogoutIcon = (props) => (
  <Line {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </Line>
)

export const TrashIcon = (props) => (
  <Line {...props}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </Line>
)

export const ListIcon = (props) => (
  <Line {...props}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Line>
)

export const ClockIcon = (props) => (
  <Line {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Line>
)

export const ImageIcon = (props) => (
  <Line {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="m21 15-4-4L7 19" />
  </Line>
)

export const SlidersIcon = (props) => (
  <Line {...props}>
    <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="14" cy="18" r="2" />
  </Line>
)

export const DocumentIcon = (props) => (
  <Line {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6M9 13h6M9 17h4" />
  </Line>
)

export const LightbulbIcon = (props) => (
  <Line {...props}>
    <path d="M9 18h6M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.9c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" />
  </Line>
)

export const MenuIcon = (props) => (
  <Line {...props}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Line>
)

export const ExpandIcon = (props) => (
  <Line {...props}>
    <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
  </Line>
)

export const ArrowLeftIcon = (props) => (
  <Line {...props}>
    <path d="m15 18-6-6 6-6M9 12h12" />
  </Line>
)

export const XCircleIcon = (props) => (
  <Line {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </Line>
)

export const XIcon = (props) => (
  <Line {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Line>
)

export const CopyIcon = (props) => (
  <Line {...props}>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </Line>
)

export const ArrowRightIcon = (props) => (
  <Line {...props}>
    <path d="m9 18 6-6-6-6M15 12H3" />
  </Line>
)

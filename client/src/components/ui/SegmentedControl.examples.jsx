import { useState } from 'react'
import {
  CheckCircleIcon,
  ClockIcon,
  ImageIcon,
  ListIcon,
  MonitorIcon,
  PhoneIcon,
  SlidersIcon,
  UsersIcon,
} from '../icons/ui.jsx'
import { SegmentedControl } from './SegmentedControl.jsx'

const densityOptions = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'spacious', label: 'Spacious' },
]

const deviceOptions = [
  { value: 'desktop', label: 'Desktop', icon: <MonitorIcon /> },
  { value: 'tablet', label: 'Tablet', icon: <ListIcon /> },
  { value: 'phone', label: 'Phone', icon: <PhoneIcon /> },
  { value: 'watch', label: 'Watch', icon: <ClockIcon /> },
  { value: 'kiosk', label: 'Kiosk display', icon: <UsersIcon /> },
  { value: 'embed', label: 'Embedded panel', icon: <ImageIcon /> },
]

const publishOptions = [
  {
    value: 'draft',
    label: 'Draft',
    description: 'Only editors can see it.',
    icon: <ListIcon />,
  },
  {
    value: 'review',
    label: 'Ready for review',
    description: 'Ask another team member to approve it.',
    icon: <CheckCircleIcon />,
  },
  {
    value: 'scheduled',
    label: 'Scheduled release window',
    description: 'Publish automatically at the selected time.',
    icon: <ClockIcon />,
  },
  {
    value: 'live',
    label: 'Live',
    description: 'Available to everyone with access.',
    icon: <UsersIcon />,
  },
]

const reportOptions = [
  {
    value: 'summary',
    label: 'Executive summary with a long label',
    description: 'Wraps across lines without breaking the grouped control.',
  },
  {
    value: 'activity',
    label: 'Activity timeline',
    description: 'Includes events and ownership changes.',
  },
  {
    value: 'quality',
    label: 'Quality checks',
    description: 'Highlights warnings and blockers.',
  },
  {
    value: 'automation',
    label: 'Automation coverage',
    description: 'Disabled until automation data exists.',
    disabled: true,
  },
]

const keyboardOptions = [
  { value: 'left', label: 'Left', icon: <SlidersIcon /> },
  { value: 'center', label: 'Center', icon: <CheckCircleIcon /> },
  { value: 'right', label: 'Right', icon: <SlidersIcon /> },
]

const ExampleBlock = ({ title, children }) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-sm font-black text-gray-800">{title}</h3>
    {children}
  </section>
)

// Local component-library examples. This app does not currently include
// Storybook, so these examples live beside the shared component.
export const SegmentedControlExamples = () => {
  const [density, setDensity] = useState('comfortable')
  const [device, setDevice] = useState('desktop')
  const [publish, setPublish] = useState('review')
  const [dropdownPublish, setDropdownPublish] = useState('draft')
  const [report, setReport] = useState('summary')
  const [keyboard, setKeyboard] = useState('center')

  return (
    <div className="flex max-w-5xl flex-col gap-6 p-6">
      <ExampleBlock title="Horizontal row">
        <SegmentedControl
          ariaLabel="Density"
          options={densityOptions}
          value={density}
          onChange={setDensity}
          layout="row"
        />
      </ExampleBlock>

      <ExampleBlock title="Horizontally scrollable row">
        <div className="max-w-md">
          <SegmentedControl
            ariaLabel="Preview device"
            options={deviceOptions}
            value={device}
            onChange={setDevice}
            layout="row"
            optionMinWidth="8.5rem"
          />
        </div>
      </ExampleBlock>

      <ExampleBlock title="Table/grid layout with icons and descriptions">
        <SegmentedControl
          ariaLabel="Publishing status"
          options={publishOptions}
          value={publish}
          onChange={setPublish}
          layout="grid"
          optionMinWidth="14rem"
        />
      </ExampleBlock>

      <ExampleBlock title="Dropdown field with grid panel">
        <SegmentedControl
          ariaLabel="Publishing status"
          options={publishOptions}
          value={dropdownPublish}
          onChange={setDropdownPublish}
          variant="dropdown"
          layout="grid"
          optionMinWidth="14rem"
        />
      </ExampleBlock>

      <ExampleBlock title="Long labels and disabled items">
        <SegmentedControl
          ariaLabel="Report view"
          options={reportOptions}
          value={report}
          onChange={setReport}
          layout="grid"
          optionMinWidth="13rem"
        />
      </ExampleBlock>

      <ExampleBlock title="Keyboard interaction">
        <SegmentedControl
          ariaLabel="Alignment"
          options={keyboardOptions}
          value={keyboard}
          onChange={setKeyboard}
          layout="row"
        />
        <p className="text-xs font-semibold text-gray-500">
          Tab into the group, then use arrow keys, Home, and End to move the selected option.
        </p>
      </ExampleBlock>
    </div>
  )
}

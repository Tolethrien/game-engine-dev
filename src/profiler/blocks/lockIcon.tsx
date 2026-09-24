export default function LockIcon(props: { closed: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
    >
      <rect x="3" y="7" width="10" height="7" rx="1" />
      <path d={props.closed ? "M5 7V5a3 3 0 0 1 6 0v2" : "M5 7V5a3 3 0 0 1 6 0"} />
    </svg>
  );
}

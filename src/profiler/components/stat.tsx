export default function Stat(props: { label: string; value: string }) {
  return (
    <div class="flex items-baseline gap-gutter whitespace-nowrap group-data-[surface=head]/slot:flex-col group-data-[surface=head]/slot:items-start group-data-[surface=head]/slot:gap-0 group-data-[surface=head]/slot:leading-[1.1]">
      <span class="text-body text-fg-dim group-data-[surface=head]/slot:text-micro">
        {props.label}
      </span>
      <span class="text-body font-semibold text-fg">{props.value}</span>
    </div>
  );
}

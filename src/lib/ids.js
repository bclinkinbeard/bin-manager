function formatBinId(number) {
  return `BIN-${String(number).padStart(3, '0')}`;
}

export { formatBinId };

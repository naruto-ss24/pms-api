export type Barangay = {
  id: number; // bigint(20) unsigned
  code: string; // varchar(45), primary key, not nullable
  areacode: string; // varchar(45), not nullable
  muncode: string; // varchar(45), not nullable
  name: string; // text, not nullable
  status: number; // int(1), not nullable
  ncode?: string | null; // varchar(45), nullable
};

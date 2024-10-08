export type District = {
  id: number; // bigint(20) unsigned
  code: string; // varchar(45), primary key, not nullable
  name: string; // text, not nullable
  status: number; // int(1), not nullable
};

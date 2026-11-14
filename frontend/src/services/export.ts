export function downloadCsv(name:string, rows:Record<string,string|number>[]) {
  if(!rows.length) return false
  const columns=Object.keys(rows[0])
  const escape=(value:string|number)=>`"${String(value).replaceAll('"','""')}"`
  const csv=[columns.map(escape).join(','),...rows.map(row=>columns.map(column=>escape(row[column]??'')).join(','))].join('\r\n')
  const blob=new Blob([`\uFEFF${csv}`],{type:'text/csv;charset=utf-8'})
  const url=URL.createObjectURL(blob)
  const link=document.createElement('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url)
  return true
}

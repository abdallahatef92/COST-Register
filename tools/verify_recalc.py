# Independent check: build with NO_RESULT=1, let LibreOffice recalculate it, then compare every cell with the results this tool computed itself.
# usage: python3 tools/verify_recalc.py   (edit the two paths below)
import openpyxl, sys, math
a=openpyxl.load_workbook('/home/user/COST-Register/out/Cost_Register.xlsx',data_only=True,read_only=True)   # my computed results
b=openpyxl.load_workbook('lo/noresult.xlsx',data_only=True,read_only=True)                                  # LibreOffice recalculated
bad=0; tot=0
for n in a.sheetnames:
    if n not in b.sheetnames: print('missing',n); continue
    ra=a[n].iter_rows(values_only=True); rb=b[n].iter_rows(values_only=True); sheet_bad=0; cnt=0
    for i,(x,y) in enumerate(zip(ra,rb),1):
        for j,(u,v) in enumerate(zip(x,y),1):
            if u is None and v is None: continue
            cnt+=1
            if isinstance(u,(int,float)) and isinstance(v,(int,float)):
                ok=abs(u-v)<=0.011+1e-9*abs(u)
            else: ok=(str(u or '')==str(v or ''))
            if not ok:
                sheet_bad+=1
                if sheet_bad<=4: print('  DIFF',n,i,j,repr(u),repr(v))
    tot+=cnt; bad+=sheet_bad
    print(f'{n:34s} cells {cnt:8d} diffs {sheet_bad}')
print('TOTAL cells',tot,'diffs',bad)

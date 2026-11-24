import pandas as pd
R="data/raw/A_bathwal/"
ec=pd.read_csv(R+"economy.csv"); bz=pd.read_csv(R+"business.csv")
raw=pd.concat([ec.assign(cls="Economy"),bz.assign(cls="Business")],ignore_index=True)
raw["flight"]=raw.ch_code+"-"+raw.num_code.astype(str); raw["price"]=raw.price.str.replace(",","").astype(int)
raw["d"]=pd.to_datetime(raw.date,format="%d-%m-%Y")
cl=pd.read_csv(R+"Clean_Dataset.csv")
k=["flight","price","cls"]
cl=cl.rename(columns={"class":"cls"}); cl["from"]=cl.source_city; cl["to"]=cl.destination_city
for d in (raw,cl): d["k"]=d[["flight","from","to","cls","price"]].astype(str).agg("|".join,axis=1)
# keys that identify exactly one raw row and one clean row
ru=raw.groupby("k").d.agg(["nunique","first"]); cu=cl.groupby("k").days_left.agg(["nunique","first"])
m=ru[ru["nunique"]==1].join(cu[cu["nunique"]==1],lsuffix="_d",rsuffix="_dl",how="inner")
print("matched unambiguous keys:",len(m))
g=m.groupby("first_d").first_dl.agg(["nunique","min","max"]); print("distinct days_left per raw date (max):",g["nunique"].max())
x=m.reset_index(); x["off"]=(x.first_d-pd.Timestamp("2022-02-10")).dt.days-x.first_dl
print("days_left == (date - 2022-02-10) share:", round((x.off==0).mean(),4), "| offsets:",x.off.value_counts().head(3).to_dict())

import pandas as pd, numpy as np
R="data/raw/"
# --- E: is days_left a deterministic function of journey date?
E=pd.read_csv(R+"E_yashdharme/Cleaned_dataset.csv"); S=pd.read_csv(R+"E_yashdharme/Scraped_dataset.csv")
print("E booking dates:",S["Date of Booking"].unique())
print("E: days_left per journey date (max distinct):",E.groupby("Date_of_journey").Days_left.nunique().max(),"| dates per days_left:",E.groupby("Days_left").Date_of_journey.nunique().max())
bd=pd.to_datetime("2023-01-15"); print("E: days_left == date - booking date for all rows:",bool(((pd.to_datetime(E.Date_of_journey)-bd).dt.days==E.Days_left).all()))
print("E route pairs:",E.groupby(["Source","Destination"]).ngroups,"| dup rows by class:",E[E.duplicated(keep=False)].Class.value_counts().to_dict())
# --- A raw: days_left analogue
ec=pd.read_csv(R+"A_bathwal/economy.csv"); bz=pd.read_csv(R+"A_bathwal/business.csv")
for n,d in (("eco",ec),("biz",bz)):
    dt=pd.to_datetime(d.date,format="%d-%m-%Y"); print("A",n,"dates",dt.min().date(),dt.max().date(),"unique",dt.nunique(),"consecutive:",(dt.drop_duplicates().sort_values().diff().dropna().dt.days==1).all())
Aeco=pd.read_csv(R+"A_bathwal/Clean_Dataset.csv"); 
# Clean_Dataset row order: is days_left non-decreasing within Economy block?
e=Aeco[Aeco["class"]=="Economy"].days_left.values; print("A Clean economy block days_left non-decreasing:",bool((np.diff(e)>=0).all()),"| first/last",e[0],e[-1])
# which dropped: airlines in raw eco not in clean
print("A raw eco airlines",ec.airline.value_counts().to_dict())
# --- B vs A raw economy+business alignment
B=pd.read_csv(R+"B_goibibo/goibibo_flights_data.csv")
A=pd.concat([ec.assign(**{"class":"economy"}),bz.assign(**{"class":"business"})],ignore_index=True)
print("rows equal:",len(A)==len(B))
n=min(len(A),len(B)); a=A.iloc[:n].reset_index(drop=True); b=B.iloc[:n].reset_index(drop=True)
same_dep=(a.dep_time.values==b.dep_time.values).mean(); same_route=((a["from"].values==b["from"].values)&(a["to"].values==b["to"].values)).mean()
fl=(a.ch_code+"-"+a.num_code.astype(str)).values==b.flight_num.values
pa=a.price.str.replace(",","").astype(float).values; pb=b.price.str.replace(",","").astype(float).values
r=pb/pa
print(f"B vs A raw, same row order: dep_time equal {same_dep:.4f}, route equal {same_route:.4f}, flight# equal {fl.mean():.4f}")
print("price ratio B/A: min %.4f p25 %.4f median %.4f p75 %.4f max %.4f | share exactly equal %.4f"%(r.min(),*np.percentile(r,[25,50,75]),r.max(),(r==1).mean()))
print("B date offset vs A date:",(pd.to_datetime(b['flight date'],format='%d-%m-%Y')-pd.to_datetime(a.date,format='%d-%m-%Y')).dt.days.value_counts().head(3).to_dict())
# --- C route coverage
C=pd.read_excel(R+"C_dopodix/Data_Train.xlsx")
print("C source->dest pairs:",C.groupby(["Source","Destination"]).size().to_dict())
print("C class evidence: Business/Premium in airline or info:",int(C.Airline.str.contains("Business|Premium").sum()+(C.Additional_Info=="Business class").sum()))
print("C date counts:", pd.to_datetime(C.Date_of_Journey,format="%d/%m/%Y").dt.month.value_counts().sort_index().to_dict())
print("C price<=duplicates: dup rows with identical price:",int(C.duplicated().sum()))
print("C nulls rows:",C[C.isna().any(axis=1)].to_dict("records"))

import sys, pandas as pd
pd.set_option("display.width",250); pd.set_option("display.max_columns",50)
R="data/raw/"
files={"A_clean":R+"A_bathwal/Clean_Dataset.csv","A_biz":R+"A_bathwal/business.csv","A_eco":R+"A_bathwal/economy.csv",
"B_goibibo":R+"B_goibibo/goibibo_flights_data.csv","C_train":R+"C_dopodix/Data_Train.xlsx","C_test":R+"C_dopodix/Test_set.xlsx",
"E_clean":R+"E_yashdharme/Cleaned_dataset.csv","E_scraped":R+"E_yashdharme/Scraped_dataset.csv"}
for k in sys.argv[1:]:
    p=files[k]; df=pd.read_excel(p) if p.endswith("xlsx") else pd.read_csv(p)
    print("="*30,k,p); print("shape",df.shape,"| exact duplicate rows",int(df.duplicated().sum()))
    print(pd.DataFrame({"dtype":df.dtypes.astype(str),"nulls":df.isna().sum(),"nunique":df.nunique()}))
    print(df.head(3).to_string())

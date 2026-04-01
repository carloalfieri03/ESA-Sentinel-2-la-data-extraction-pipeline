import pystac_client
import pandas as pd
import json
from pathlib import Path
import time

REDOWNLOAD = True # set this to true 

files_imported=['data/raw_sentinel_data.json','data/single_file.json','data/mysql_import.csv','data/sentinel_metadata.json']
def clean_imports(clean_targets):
     for file in clean_targets:
          objective=Path(file)
          if objective.exists():
               objective.unlink()
               print(f'Deleted {objective}')

if REDOWNLOAD:
    clean_imports(files_imported)
    print('cleaned all donwloaded files')

json_file=Path("data/raw_sentinel_data.json")
single_json=Path("data/single_file.json")

if json_file.exists() or single_json.exists() :
     print(f'data already imported check {json_file.stem} and {single_json.stem}')
else:
    # 1. Your exact GeoJSON Polygon
    coordinates = {
        "type": "Polygon",
        "coordinates": [
            [[12.314987, 41.797936], [12.66861, 41.797936], [12.66861, 42.005938], [12.314987, 42.005938], [12.314987, 41.797936]]
        ]
    }

    # 2. Connect to Copernicus API
    print("Connecting to Copernicus STAC API...")
    catalog = pystac_client.Client.open("https://stac.dataspace.copernicus.eu/v1/")

    items_list = []
    years = ["2020", "2021", "2022", "2023", "2024"]
    print("Starting chuncked extraction to avoid timeout...")

    for year in years:
        time_window = f"{year}-01-01/{year}-12-31"
        print(f"\n--- Fetching metadata for {year} ---")
        
        search = catalog.search(
            collections=["sentinel-2-l2a"],
            intersects=coordinates,
            datetime=time_window 
        )

        try:
            for item in search.items():
                items_list.append(item.to_dict())
                
                # Every 50 items, take a small 1-second break
                if len(items_list) % 50 == 0:
                    print(f"Fetched {len(items_list)} items total... resting...")
                    time.sleep(1)
                    
        except Exception as e:
            # If a 504 happens anyway, it won't crash the script
            print(f"Warning: Hit an error during {year}: {e}")
            print("Server might be busy. Moving to the next chunk...")
            time.sleep(5) # Let the server cool down before the next year

    print(f"\nExtraction complete! Found {len(items_list)} satellite image records.")

    # Only save if we actually found items
    if items_list:
        Path("data").mkdir(parents=True, exist_ok=True)

        with open("data/single_file.json", "w") as sf:
            json.dump(items_list[0], sf, indent=4)

        with open("data/raw_sentinel_data.json", "w") as f:
            json.dump(items_list, f, indent=4)

        print("Data successfully downloaded to raw_sentinel_data.json. You can now close the API connection!")
    else:
        print("No data was fetched. Please check the API status.")

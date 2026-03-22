import pystac_client
import pandas as pd
import json
from pathlib import Path
import time

REDOWNLOAD = False

files_imported=['raw_sentinel_data.json','single_file.json','mysql_import.csv','sentinel_metadata.json']
def clean_imports(clean_targets):
     for file in clean_targets:
          objective=Path(file)
          if objective.exists():
               objective.unlink()
               print(f'Deleted {objective}')

if REDOWNLOAD:
    clean_imports(files_imported)
    print('cleaned all donwloaded files')

json_file=Path("raw_sentinel_data.json")
single_json=Path("single_file.json")

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

    # 3. Search  query using the coordinates, type of satellite and  timespan
    print("Fetching 5 years of metadata (this may take a minute or two)...")
    search = catalog.search(
        collections=["sentinel-2-l2a"],
        intersects=coordinates,  # <--- Using your polygon here!
        datetime="2020-01-01/2024-12-31" 
    )

    items_list = []
    print("Starting throttled extraction...")

    for item in search.items():
        items_list.append(item.to_dict())
        # Every 50 items, take a small 1-second break
        if len(items_list) % 50 == 0:
            print(f"Fetched {len(items_list)} items... resting...")
            time.sleep(1)

    print(f"Extraction complete! Found {len(items_list)} satellite image records.")

    import json


    with open("single_file.json", "w") as sf:
        json.dump(items_list[0], sf, indent=4)

    # Save the entire 5-year dataset to your main file
    with open("raw_sentinel_data.json", "w") as f:
        json.dump(items_list, f, indent=4)

    print("Data successfully downloaded to raw_sentinel_data.json. You can now close the API connection!")


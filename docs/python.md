export PIP_CONFIG_FILE=/dev/null

pip install requests -t ./my-lib
PYTHONPATH=./my-lib ./python your_script.py
pip install -r requirements.txt -t ./your_lib_path -i https://mirrors.aliyun.com/pypi/simple

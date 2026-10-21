import pymysql

pymysql.install_as_MySQLdb()

# Allow MySQL 8.0.x with Django 6.x
from django.db.backends.mysql.base import DatabaseWrapper

DatabaseWrapper.check_database_version_supported = lambda self: None


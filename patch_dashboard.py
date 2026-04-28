import re

with open("frontend/src/Dashboard.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Replace state variables
content = content.replace(
    "const [filterYear, setFilterYear] = useState<string>('');\n  const [filterMonth, setFilterMonth] = useState<string>('');",
    "const [startMonth, setStartMonth] = useState<string>('');\n  const [endMonth, setEndMonth] = useState<string>('');"
)

# 2. Add helper function to get start_date and end_date
helper = """
  const getQueryParams = () => {
    const queryParams = new URLSearchParams();
    if (startMonth) {
      queryParams.append('start_date', `${startMonth}-01`);
    }
    if (endMonth) {
      const [year, month] = endMonth.split('-');
      // Get the last day of the month
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      queryParams.append('end_date', `${endMonth}-${lastDay}`);
    }
    reimport re

with open("frontend/src/Dashboard.tsx", "r",t.
with op
      content = f.read()

# 1. Replace state variables
content = cont,

# 1. Replace state vetEcontent = content.replace(
on    "const [filterYear, ser    "const [startMonth, setStartMonth] = useState<string>('');\n  const [endMonth, setEndMonth] = useState<string>('');"
)

# Pa)

# 2. Add helper function to get start_date and end_date
helper = """
  const getQueryParams = () => {
    const queryParams = new UR"',helper = 
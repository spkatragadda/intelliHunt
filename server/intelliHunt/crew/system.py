from server.intelliHunt.crew.crewClass import cyberCrew
import json

crew = cyberCrew().crew()

# Example of using kickoff_for_each
inputs_array = [
    {
        "software_stack": "microsoft,crowdstrike,apple,linux,sql,aws,azure,apache,python,javascript"
    }
]  # ,apple,linux,sql,aws,azure,apache,python,javascript
results = crew.kickoff_for_each(inputs=inputs_array)
for result in results:
    print(result)


final_result = results[
    0
].raw  # Or crew_output.json_dict, crew_output.pydantic if applicable
tasks_output = results[0].tasks_output
token_usage = results[0].token_usage

# Formatting for a document
document_content = f"""
# CrewAI Execution Report

## Final Result:
{final_result}

## Task Outputs:
"""


# document_content += f"\n### {task_name}:\n{output}\n"

document_content += f"""
## Token Usage:
Input Tokens: {token_usage.prompt_tokens}
Output Tokens: {token_usage.completion_tokens}
Total Tokens: {token_usage.total_tokens}
"""

with open("server/intelliHunt/crew/crew_report.md", "w") as f:
    f.write(document_content)

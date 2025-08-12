from crewClass import cyberCrew
import json

crew = cyberCrew().crew()

# Example of using kickoff_for_each
inputs_array = [{'threat': 'on premises microsoft exchange servers'}]
results = crew.kickoff_for_each(inputs=inputs_array)
for result in results:
    print(result)

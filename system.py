from crewClass import cyberCrew
import json

crew = cyberCrew().crew()

# Example of using kickoff_for_each
inputs_array = [{'software_stack': 'microsoft,crowdstrike,apple,linux,sql,aws,azure,apache,python,javascript'}]
results = crew.kickoff_for_each(inputs=inputs_array)
for result in results:
    print(result)

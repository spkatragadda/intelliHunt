from crewai import Agent, Crew, Task, Process
from crewai.project import CrewBase, agent, task, crew, before_kickoff, after_kickoff
from crewai.agents.agent_builder.base_agent import BaseAgent
from typing import List
from langchain_community.llms import Ollama
from crewai.tools import tool
from googlesearch import search

@CrewBase
class cyberCrew:
    """Description of your crew"""

    agents: List[BaseAgent]
    tasks: List[Task]

    # Paths to your YAML configuration files
    # To see an example agent and task defined in YAML, checkout the following:
    # - Task: https://docs.crewai.com/concepts/tasks#yaml-configuration-recommended
    # - Agents: https://docs.crewai.com/concepts/agents#yaml-configuration-recommended
    agents_config = 'config/agents.yaml'
    tasks_config = 'config/tasks.yaml'

    @before_kickoff
    def prepare_inputs(self, inputs):
        # Modify inputs before the crew starts
        inputs['additional_data'] = "Some extra information"
        return inputs

    @after_kickoff
    def process_output(self, output):
        # Modify output after the crew finishes
        output.raw += "\nProcessed after kickoff."
        return output

    @tool("Google Search")
    def google_search(query: str) -> str:
        """Search Google for recent results relevant to cybersecurity threats."""
        results = []
        try:
            for result in search(query + "2025", num_results=10):
                results.append(str(result))  # Ensure result is a string
            return "\n".join(results) if results else "No results found."
        except Exception as e:
            return f"Error during Google Search: {str(e)}"

    @agent
    def cthAnalyst(self) -> Agent:
        return Agent(
            config=self.agents_config['cthAnalyst'], # type: ignore[index]
            llm=Ollama(model="ollama/CognitiveComputations/dolphin-llama3.1:latest", base_url="http://localhost:11434"),
            tools=[self.google_search],
            verbose=True
        )

    @agent
    def ctiAnalyst(self) -> Agent:
        return Agent(
            config=self.agents_config['ctiAnalyst'], # type: ignore[index]
            llm=Ollama(model="ollama/CognitiveComputations/dolphin-llama3.1:latest", base_url="http://localhost:11434"),
            tools=[self.google_search],
            verbose=True
        )

    @task
    def research_task(self) -> Task:
        return Task(
            config=self.tasks_config['research_task'] # type: ignore[index]
        )
    
    @task
    def ranking_task(self) -> Task:
        return Task(
            config=self.tasks_config['ranking_task'], # type: ignore[index]
            context=[self.research_task()] # Use the output of research_task as context
        )
    
    @task
    def splunk_query_task(self) -> Task:
        return Task(
            config=self.tasks_config['splunk_query_task'], # type: ignore[index]
            context=[self.ranking_task()] # Use the output of research_task as context
        )


    # @task
    # def task_two(self) -> Task:
    #     return Task(
    #         config=self.tasks_config['task_two'] # type: ignore[index]
    #     )

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,  # Automatically collected by the @agent decorator
            tasks=self.tasks,    # Automatically collected by the @task decorator.
            process=Process.sequential,
            verbose=True,
        )
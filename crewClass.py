from crewai import Agent, Crew, Task, Process
from crewai.project import CrewBase, agent, task, crew, before_kickoff, after_kickoff
from crewai.agents.agent_builder.base_agent import BaseAgent
from typing import List
from langchain_community.llms import Ollama
from crewai.tools import tool
from googlesearch import search
from crewai_tools import RagTool
from langchain_groq import ChatGroq

# Initialize the RAG Tool
rag_tool = RagTool()

# Define a list of raw strings
raw_strings_list = [
    """sourcetype name: WinEventLog:Security; fields: EventCode, Account_Name, Logon_Type, Process_Name, Parent_Process_Name, Target_User_Name, host; description: Logs from the Windows Security event log, which tracks events like user logon/logoff, account management, and process creation. This is a critical sourcetype for detecting host-based attacks and insider threats.""",
    """sourcetype name: linux_secure; fields: user, host, src_ip, authentication_method, session_id; description: Logs from the /var/log/secure file on Linux systems, which records authentication-related events.""",
    """sourcetype name: linux_audit; fields: type, syscall, pid, exe, comm, success, exit; description: Logs from the Linux Auditd framework, which provides granular monitoring of system calls and file access.""",
    """sourcetype name: cisco:asa; fields: action, src_ip, dest_ip, src_port, dest_port, protocol, reason, message; description: Logs from Cisco Adaptive Security Appliances (ASA) firewalls, detailing network traffic and security events.""",
    """sourcetype name: pan:traffic; fields: action, src_ip, dest_ip, src_port, dest_port, protocol, app, bytes_sent, bytes_received, rule; description: Logs from Palo Alto Networks firewalls detailing network traffic flows.""",
    """sourcetype name: snort; fields: signature_id, signature, src_ip, dest_ip, src_port, dest_port, priority; description: Logs from the Snort Intrusion Detection System (IDS), which identifies malicious network activity.""",
    """sourcetype name: access_combined; fields: clientip, method, uri_path, status, bytes, useragent; description: A standard format for web server access logs (e.g., from Apache), detailing web requests.""",
    """sourcetype name: apache_error; fields: client, error_message, level; description: Logs from Apache web servers detailing errors and other server-side issues.""",
    """sourcetype name: iis; fields: c_ip, cs_method, cs_uri_stem, sc_status, cs_useragent; description: Logs from Microsoft Internet Information Services (IIS) web servers.""",
    """sourcetype name: Proofpoint:TAP:syslog; fields: event_type, sender, recipient, subject, threat_status, threat_name, url; description: Logs from Proofpoint Targeted Attack Protection (TAP), which provides advanced email threat protection.""",
    """sourcetype name: MSExchange:2013:MessageTracking; fields: source_context, sender, recipient, message_subject, event_id, message_info; description: Logs from Microsoft Exchange Server that track the flow of messages.""",
    """sourcetype name: cisco:esa:syslog; fields: sender, recipient, subject, direction, verdict; description: Logs from Cisco Email Security Appliances (ESA) that monitor and control email traffic.""",
]

# Add each raw string from the list to the RAG tool
for text_item in raw_strings_list:
    rag_tool.add(data_type="text", content=text_item)


# Initialize the Groq LLM
llm = ChatGroq(
    temperature=0,
    model_name="qwen/qwen3-32b" # Or another Groq model like llama3-8b-8192
)


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
            llm=llm, #Ollama(model="ollama/qwen3:8b", base_url="http://localhost:11434")
            tools=[self.google_search],
            verbose=True
        )

    @agent
    def ctiAnalyst(self) -> Agent:
        return Agent(
            config=self.agents_config['ctiAnalyst'], # type: ignore[index]
            llm=llm,
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